"""
URL routing for CSV export. Mounted in api_urls.py under ``exports/``.
"""
from django.urls import path

from khaata.apps.exports.views import TransactionCsvExportView

urlpatterns = [
    path("transactions.csv", TransactionCsvExportView.as_view(), name="export-transactions-csv"),
]
