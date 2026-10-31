"""
Views for the Reports API (BE-007). Read-only GET endpoints; every query is
scoped to the authenticated user in ``khaata.apps.reports.services``.
Unknown and cross-user book ids produce an identical 404.
"""
from django.http import Http404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.apps.books.models import Book
from khaata.apps.reports import services
from khaata.apps.reports.serializers import (
    BookReportSerializer,
    BudgetUtilizationReportSerializer,
    MonthlyReportSerializer,
    ReportPeriodQuerySerializer,
)


def _period(request) -> tuple[int, int]:
    params = ReportPeriodQuerySerializer(data=request.query_params)
    params.is_valid(raise_exception=True)
    return params.validated_data["year"], params.validated_data["month"]


class MonthlyReportView(APIView):
    """GET /api/v1/reports/monthly/?year=&month="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        year, month = _period(request)
        report = services.monthly_report(request.user, year, month)
        return Response(MonthlyReportSerializer(report).data, status=status.HTTP_200_OK)


class BookReportView(APIView):
    """GET /api/v1/reports/books/{id}/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            report = services.book_report(request.user, id)
        except Book.DoesNotExist:
            raise Http404
        return Response(BookReportSerializer(report).data, status=status.HTTP_200_OK)


class BudgetUtilizationReportView(APIView):
    """GET /api/v1/reports/budget-utilization/?year=&month="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        year, month = _period(request)
        report = services.budget_utilization_report(request.user, year, month)
        return Response(
            BudgetUtilizationReportSerializer(report).data, status=status.HTTP_200_OK
        )
