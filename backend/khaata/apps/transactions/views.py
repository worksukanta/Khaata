"""
Views for the Categories, Payment Methods and Transactions API.

All querysets are scoped to the authenticated user; objects owned by other
users resolve to 404 (API_CONTRACT.md section 1).
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.apps.transactions.models import (
    Category,
    CategoryType,
    PaymentMethod,
    Transaction,
)
from khaata.apps.transactions.serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
    PaymentMethodUpdateSerializer,
    TransactionCreateSerializer,
    TransactionFilterSerializer,
    TransactionSerializer,
    TransactionUpdateSerializer,
)
from khaata.apps.transactions.services import (
    create_category,
    create_payment_method,
    create_transaction,
    soft_delete_transaction,
    update_category,
    update_payment_method,
    update_transaction,
)


def _filter_is_active(queryset, request):
    value = request.query_params.get("is_active")
    if value is not None:
        if value.lower() in ("true", "1"):
            queryset = queryset.filter(is_active=True)
        elif value.lower() in ("false", "0"):
            queryset = queryset.filter(is_active=False)
    return queryset


def _raise_drf_validation(exc: DjangoValidationError):
    raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)


class CategoryListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/categories/
        Filters: type=INCOME|EXPENSE, is_active=true|false, search=<substring>.
    POST /api/v1/categories/
        Create a custom category for the authenticated user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer

    def get_queryset(self):
        queryset = Category.objects.filter(owner=self.request.user)

        category_type = self.request.query_params.get("type")
        if category_type:
            if category_type.upper() in CategoryType.values:
                queryset = queryset.filter(type=category_type.upper())
            else:
                queryset = queryset.none()

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        return _filter_is_active(queryset, self.request).order_by("type", "name", "id")

    def create(self, request, *args, **kwargs):
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            category = create_category(request.user, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    """PATCH /api/v1/categories/{id}/ — update name and/or is_active."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        category = get_object_or_404(Category, id=id, owner=request.user)
        serializer = CategoryUpdateSerializer(instance=category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            category = update_category(category, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(CategorySerializer(category).data, status=status.HTTP_200_OK)


class PaymentMethodListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/payment-methods/
        Filters: is_active=true|false, search=<substring>.
    POST /api/v1/payment-methods/
        Create a payment method label for the authenticated user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PaymentMethodSerializer

    def get_queryset(self):
        queryset = PaymentMethod.objects.filter(owner=self.request.user)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        return _filter_is_active(queryset, self.request).order_by("name", "id")

    def create(self, request, *args, **kwargs):
        serializer = PaymentMethodCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            method = create_payment_method(request.user, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(PaymentMethodSerializer(method).data, status=status.HTTP_201_CREATED)


class PaymentMethodDetailView(APIView):
    """PATCH /api/v1/payment-methods/{id}/ — update name and/or is_active."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        method = get_object_or_404(PaymentMethod, id=id, owner=request.user)
        serializer = PaymentMethodUpdateSerializer(instance=method, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            method = update_payment_method(method, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(PaymentMethodSerializer(method).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Transactions (BE-005)
# ---------------------------------------------------------------------------
_TRANSACTION_ORDERINGS = {
    "transaction_date",
    "-transaction_date",
    "amount",
    "-amount",
    "created_at",
    "-created_at",
}


def _owned_transactions(user):
    """Active transactions reachable through the user's books."""
    return Transaction.objects.filter(book__owner=user).select_related("category", "payment_method")


class TransactionListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/transactions/
        Filters (AND): book_id, type, category_id, payment_method_id, date_from,
        date_to, search (description substring). ordering: transaction_date |
        amount | created_at (prefix "-" for descending). Soft-deleted records are
        never returned.
    POST /api/v1/transactions/
        Create an INCOME or EXPENSE transaction in one of the user's books.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer

    def get_queryset(self):
        params = TransactionFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data

        queryset = _owned_transactions(self.request.user)
        if "book_id" in filters:
            queryset = queryset.filter(book_id=filters["book_id"])
        if "type" in filters:
            queryset = queryset.filter(type=filters["type"])
        if "category_id" in filters:
            queryset = queryset.filter(category_id=filters["category_id"])
        if "payment_method_id" in filters:
            queryset = queryset.filter(payment_method_id=filters["payment_method_id"])
        if "date_from" in filters:
            queryset = queryset.filter(transaction_date__gte=filters["date_from"])
        if "date_to" in filters:
            queryset = queryset.filter(transaction_date__lte=filters["date_to"])
        if filters.get("search"):
            queryset = queryset.filter(description__icontains=filters["search"])

        ordering = self.request.query_params.get("ordering")
        if ordering in _TRANSACTION_ORDERINGS:
            # created_at/id tie-breakers keep pagination deterministic.
            return queryset.order_by(ordering, "-created_at", "-id")
        return queryset.order_by("-transaction_date", "-created_at", "-id")

    def create(self, request, *args, **kwargs):
        serializer = TransactionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            txn = create_transaction(request.user, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(TransactionSerializer(txn).data, status=status.HTTP_201_CREATED)


class TransactionDetailView(APIView):
    """
    GET    /api/v1/transactions/{id}/  � one active transaction owned by the user.
    PATCH  /api/v1/transactions/{id}/  � partial update.
    DELETE /api/v1/transactions/{id}/  � soft delete (idempotent, 204).
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, id):
        return get_object_or_404(_owned_transactions(self.request.user), id=id)

    def get(self, request, id):
        return Response(TransactionSerializer(self.get_object(id)).data, status=status.HTTP_200_OK)

    def patch(self, request, id):
        self.get_object(id)  # 404 for missing, deleted or cross-user ids
        serializer = TransactionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            txn = update_transaction(request.user, id, serializer.validated_data)
        except Transaction.DoesNotExist:
            raise Http404
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(TransactionSerializer(txn).data, status=status.HTTP_200_OK)

    def delete(self, request, id):
        try:
            soft_delete_transaction(request.user, id)
        except Transaction.DoesNotExist:
            raise Http404
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)
