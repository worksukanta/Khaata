"""
Response serializers for the Reports API (BE-007). All serializers are
read-only renderers of the dicts built by ``khaata.apps.reports.services``;
nothing is accepted from the client except validated query parameters.

Money is rendered as a decimal string. ``max_digits`` is left unset so that
sums over many rows never trip DRF's per-field precision context; values are
still quantized to 2 decimal places.
"""
from rest_framework import serializers

from khaata.apps.books.models import Book, BookType
from khaata.apps.budgets.serializers import BudgetSerializer
from khaata.apps.budgets.services import MAX_YEAR, MIN_YEAR
from khaata.apps.transactions.serializers import TransactionSerializer


def _money(**kwargs):
    return serializers.DecimalField(max_digits=None, decimal_places=2, **kwargs)


class ReportPeriodQuerySerializer(serializers.Serializer):
    """Validates ``?year=&month=`` for the monthly report and budget utilization."""

    year = serializers.IntegerField(min_value=MIN_YEAR, max_value=MAX_YEAR)
    month = serializers.IntegerField(min_value=1, max_value=12)


class PeriodSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()


class BookTypeBreakdownSerializer(serializers.Serializer):
    book_type = serializers.ChoiceField(choices=BookType.choices)
    income = _money()
    expenses = _money()


class CategoryBreakdownSerializer(serializers.Serializer):
    category_id = serializers.UUIDField(allow_null=True)
    category_name = serializers.CharField()
    total = _money()


class MonthlyBudgetSummarySerializer(serializers.Serializer):
    """Nulls everywhere (status ``NOT_SET``) when no monthly budget exists."""

    total_limit = _money(allow_null=True)
    spent = _money(allow_null=True)
    remaining = _money(allow_null=True)  # signed: negative when overspent
    utilization_percent = _money(allow_null=True)
    status = serializers.CharField()


class MonthlyReportSerializer(serializers.Serializer):
    period = PeriodSerializer()
    currency = serializers.CharField()
    income_total = _money()
    expense_total = _money()
    net_cash_flow = _money()
    book_type_breakdown = BookTypeBreakdownSerializer(many=True)
    category_breakdown = CategoryBreakdownSerializer(many=True)
    budget = MonthlyBudgetSummarySerializer()
    recent_transactions = TransactionSerializer(many=True)


class ReportBookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "type", "name", "is_archived"]
        read_only_fields = fields


class BookReportSerializer(serializers.Serializer):
    book = ReportBookSerializer()
    income_total = _money()
    expense_total = _money()
    net_cash_flow = _money()
    closing_balance = _money()
    category_breakdown = CategoryBreakdownSerializer(many=True)
    # Event budget for EVENT books; null otherwise (reuses the BE-006 serializer).
    budget = BudgetSerializer(allow_null=True)


class BudgetUtilizationReportSerializer(serializers.Serializer):
    period = PeriodSerializer()
    budget = BudgetSerializer(allow_null=True)
