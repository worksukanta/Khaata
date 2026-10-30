"""
Views for the Budgets API (BE-006).

All querysets are scoped to the authenticated user; budgets owned by other
users resolve to 404 (API_CONTRACT.md section 1). Business rules live in
``khaata.apps.budgets.services``.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.apps.budgets.models import Budget
from khaata.apps.budgets.serializers import (
    AllocationReplaceSerializer,
    BudgetCreateSerializer,
    BudgetFilterSerializer,
    BudgetSerializer,
    BudgetUpdateSerializer,
)
from khaata.apps.budgets.services import (
    AllocationItemError,
    create_budget,
    replace_allocations,
    update_budget,
)


def _raise_drf_validation(exc: DjangoValidationError):
    raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)


def _owned_budgets(user):
    return Budget.objects.filter(owner=user)


class BudgetListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/budgets/
        Filters (AND): scope, year, month, book_id. Fixed deterministic order:
        newest period first.
    POST /api/v1/budgets/
        Create a MONTHLY_OVERALL or EVENT budget.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = BudgetSerializer

    def get_queryset(self):
        params = BudgetFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data

        queryset = _owned_budgets(self.request.user)
        for field in ("scope", "year", "month"):
            if field in filters:
                queryset = queryset.filter(**{field: filters[field]})
        if "book_id" in filters:
            queryset = queryset.filter(book_id=filters["book_id"])
        # Explicit NULLS LAST: event budgets have no period, and NULL ordering
        # differs between SQLite and PostgreSQL.
        return queryset.order_by(
            F("year").desc(nulls_last=True),
            F("month").desc(nulls_last=True),
            "scope",
            "-created_at",
            "-id",
        )

    def create(self, request, *args, **kwargs):
        serializer = BudgetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            budget = create_budget(request.user, serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(BudgetSerializer(budget).data, status=status.HTTP_201_CREATED)


class BudgetDetailView(APIView):
    """
    GET   /api/v1/budgets/{id}/  definition, allocations and derived spending.
    PATCH /api/v1/budgets/{id}/  update total_limit / monthly period.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        budget = get_object_or_404(_owned_budgets(request.user), id=id)
        return Response(BudgetSerializer(budget).data, status=status.HTTP_200_OK)

    def patch(self, request, id):
        get_object_or_404(_owned_budgets(request.user), id=id)  # 404 before body validation
        serializer = BudgetUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            budget = update_budget(request.user, id, serializer.validated_data)
        except Budget.DoesNotExist:
            raise Http404
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(BudgetSerializer(budget).data, status=status.HTTP_200_OK)


class BudgetAllocationsView(APIView):
    """PUT /api/v1/budgets/{id}/allocations/  atomic full replacement."""

    permission_classes = [IsAuthenticated]

    def put(self, request, id):
        get_object_or_404(_owned_budgets(request.user), id=id)  # 404 before body validation
        serializer = AllocationReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            budget = replace_allocations(
                request.user, id, serializer.validated_data["allocations"]
            )
        except Budget.DoesNotExist:
            raise Http404
        except AllocationItemError as exc:
            raise ValidationError(exc.details)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(BudgetSerializer(budget).data, status=status.HTTP_200_OK)
