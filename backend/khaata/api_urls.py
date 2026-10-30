"""
API v1 URL configuration.
All routes prefixed with /api/v1/ by the root urls.py.
"""
from django.urls import include, path

from khaata.apps.health.views import HealthView
from khaata.apps.transactions.urls import category_urlpatterns, payment_method_urlpatterns

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/", include("khaata.apps.accounts.urls")),
    path("books/", include("khaata.apps.books.urls")),
    path("categories/", include(category_urlpatterns)),
    path("payment-methods/", include(payment_method_urlpatterns)),
]
