"""
Reports app configuration.

Per SYSTEM_ARCHITECTURE.md section 4 this module owns read-only dashboards and
reports derived from active transactions and budgets. It has no models.
"""
from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "khaata.apps.reports"
    label = "reports"
    verbose_name = "Reports"
