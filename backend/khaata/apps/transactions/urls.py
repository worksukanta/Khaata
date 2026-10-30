"""
URL routing for Categories and Payment Methods.

Mounted twice in api_urls.py under `categories/` and `payment-methods/`.
"""
from django.urls import path

from khaata.apps.transactions.views import (
    CategoryDetailView,
    CategoryListCreateView,
    PaymentMethodDetailView,
    PaymentMethodListCreateView,
)

category_urlpatterns = [
    path("", CategoryListCreateView.as_view(), name="category-list-create"),
    path("<uuid:id>/", CategoryDetailView.as_view(), name="category-detail"),
]

payment_method_urlpatterns = [
    path("", PaymentMethodListCreateView.as_view(), name="payment-method-list-create"),
    path("<uuid:id>/", PaymentMethodDetailView.as_view(), name="payment-method-detail"),
]
