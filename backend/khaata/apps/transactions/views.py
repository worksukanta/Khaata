"""
Views for the Categories and Payment Methods API.

All querysets are scoped to the authenticated user; objects owned by other
users resolve to 404 (API_CONTRACT.md section 1).
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.apps.transactions.models import Category, CategoryType, PaymentMethod
from khaata.apps.transactions.serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
    PaymentMethodUpdateSerializer,
)
from khaata.apps.transactions.services import (
    create_category,
    create_payment_method,
    update_category,
    update_payment_method,
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
