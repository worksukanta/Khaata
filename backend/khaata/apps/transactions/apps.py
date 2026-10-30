"""
Transactions app configuration.

Per SYSTEM_ARCHITECTURE.md section 4 this module owns income/expense records,
categories and payment-method labels. BE-004 introduces categories and payment
methods; the Transaction model itself arrives with BE-005.
"""
from django.apps import AppConfig


class TransactionsConfig(AppConfig):
    name = "khaata.apps.transactions"
    label = "transactions"
    verbose_name = "Transactions"
