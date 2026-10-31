"""
URL routing for Reports. Mounted in api_urls.py under `reports/`.
"""
from django.urls import path

from khaata.apps.reports.views import (
    BookReportView,
    BudgetUtilizationReportView,
    MonthlyReportView,
)

urlpatterns = [
    path("monthly/", MonthlyReportView.as_view(), name="report-monthly"),
    path("books/<uuid:id>/", BookReportView.as_view(), name="report-book"),
    path(
        "budget-utilization/",
        BudgetUtilizationReportView.as_view(),
        name="report-budget-utilization",
    ),
]
