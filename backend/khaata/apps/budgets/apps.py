"""
Budgets app configuration.

Per SYSTEM_ARCHITECTURE.md section 4 this module owns overall monthly and
event budgets, atomic allocation replacement and derived overspending
calculations.
"""
from django.apps import AppConfig


class BudgetsConfig(AppConfig):
    name = "khaata.apps.budgets"
    label = "budgets"
    verbose_name = "Budgets"
