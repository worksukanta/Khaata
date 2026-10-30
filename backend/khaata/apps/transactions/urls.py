"""
URL routing for Categories, Payment Methods and Transactions.

Mounted in api_urls.py under `categories/`, `payment-methods/` and `transactions/`.
"""
from django.urls import path

from khaata.apps.transactions.views import (
    CategoryDetailView,
    CategoryListCreateView,
    PaymentMethodDetailView,
    PaymentMethodListCreateView,
    TransactionDetailView,
    TransactionListCreateView,
)

category_urlpatterns = [
    path("", CategoryListCreateView.as_view(), name="category-list-create"),
    path("<uuid:id>/", CategoryDetailView.as_view(), name="category-detail"),
]

payment_method_urlpatterns = [
    path("", PaymentMethodListCreateView.as_view(), name="payment-method-list-create"),
    path("<uuid:id>/", PaymentMethodDetailView.as_view(), name="payment-method-detail"),
]

transaction_urlpatterns = [
    path("", TransactionListCreateView.as_view(), name="transaction-list-create"),
    path("<uuid:id>/", TransactionDetailView.as_view(), name="transaction-detail"),
]
