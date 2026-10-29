"""
API v1 URL configuration.
All routes prefixed with /api/v1/ by the root urls.py.
"""
from django.urls import path

from khaata.apps.health.views import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
]
