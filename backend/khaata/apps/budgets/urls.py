"""
URL routing for Budgets. Mounted in api_urls.py under `budgets/`.
"""
from django.urls import path

from khaata.apps.budgets.views import (
    BudgetAllocationsView,
    BudgetDetailView,
    BudgetListCreateView,
)

urlpatterns = [
    path("", BudgetListCreateView.as_view(), name="budget-list-create"),
    path("<uuid:id>/", BudgetDetailView.as_view(), name="budget-detail"),
    path("<uuid:id>/allocations/", BudgetAllocationsView.as_view(), name="budget-allocations"),
]
