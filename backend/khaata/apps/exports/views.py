"""
Views for the CSV export API (BE-008).

GET /api/v1/exports/transactions.csv
  - Returns the authenticated user's active transactions as a CSV file.
  - Accepts the same filters as GET /api/v1/transactions/.
  - No pagination: the full matching result set is exported.
  - Formula-injection characters (= + - @) at the start of user-controlled
    cells are prefixed with a tab so spreadsheet applications do not
    interpret them as formulae (OWASP CSV injection mitigation).
  - Ownership is enforced server-side via ``book__owner=request.user``.
  - Soft-deleted transactions (deleted_at IS NOT NULL) are never exported
    (Transaction.objects is the active-only manager).
"""
import csv
import io

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from khaata.apps.transactions.models import Transaction
from khaata.apps.transactions.serializers import TransactionFilterSerializer

# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------
_FORMULA_PREFIXES = ("=", "+", "-", "@")

_CSV_HEADERS = [
    "id",
    "book_id",
    "type",
    "amount",
    "transaction_date",
    "category_id",
    "category_name",
    "payment_method_id",
    "payment_method_name",
    "description",
    "created_at",
    "updated_at",
]


def _escape_formula(value: str) -> str:
    """
    Prefix cells that start with a formula-injection character with a tab.
    Applies to any user-controlled free-text column.
    """
    if value and value[0] in _FORMULA_PREFIXES:
        return "\t" + value
    return value


def _row(txn: Transaction) -> list:
    """Build one CSV row from a Transaction instance."""
    category_id = str(txn.category_id) if txn.category_id else ""
    category_name = _escape_formula(txn.category.name if txn.category else "")
    payment_method_id = str(txn.payment_method_id) if txn.payment_method_id else ""
    payment_method_name = _escape_formula(
        txn.payment_method.name if txn.payment_method else ""
    )
    description = _escape_formula(txn.description or "")
    return [
        str(txn.id),
        str(txn.book_id),
        txn.type,
        str(txn.amount),
        txn.transaction_date.isoformat(),
        category_id,
        category_name,
        payment_method_id,
        payment_method_name,
        description,
        txn.created_at.isoformat(),
        txn.updated_at.isoformat(),
    ]


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------
class TransactionCsvExportView(APIView):
    """
    GET /api/v1/exports/transactions.csv

    Exports the authenticated user's active transactions as a UTF-8 CSV.
    Accepts the same query filters as GET /api/v1/transactions/ (book_id,
    type, category_id, payment_method_id, date_from, date_to, search).
    The ordering parameter is not supported; default ordering applies
    (-transaction_date, -created_at, -id).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # --- Validate filters (malformed values → 400) ---------------------
        params = TransactionFilterSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data

        # --- Build owner-scoped, active-only queryset ----------------------
        queryset = (
            Transaction.objects.filter(book__owner=request.user)
            .select_related("category", "payment_method")
            .order_by("-transaction_date", "-created_at", "-id")
        )

        if "book_id" in filters:
            queryset = queryset.filter(book_id=filters["book_id"])
        if "type" in filters:
            queryset = queryset.filter(type=filters["type"])
        if "category_id" in filters:
            queryset = queryset.filter(category_id=filters["category_id"])
        if "payment_method_id" in filters:
            queryset = queryset.filter(payment_method_id=filters["payment_method_id"])
        if "date_from" in filters:
            queryset = queryset.filter(transaction_date__gte=filters["date_from"])
        if "date_to" in filters:
            queryset = queryset.filter(transaction_date__lte=filters["date_to"])
        if filters.get("search"):
            queryset = queryset.filter(description__icontains=filters["search"])

        # --- Build CSV in memory and return as a streaming response --------
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(_CSV_HEADERS)
        for txn in queryset:
            writer.writerow(_row(txn))

        response = HttpResponse(
            buf.getvalue(),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = 'attachment; filename="transactions.csv"'
        return response
