"""
Read-only report services (BE-007).

Every figure is derived on each call from active transactions
(``Transaction.objects`` excludes soft-deleted rows) with database-side
aggregation; nothing is stored. Ownership is always established through
``book__owner`` for the authenticated user passed in by the view - no owner id
is ever taken from request input. Monetary values are ``Decimal`` throughout.

Transfers are not modelled in V1, so INCOME/EXPENSE are the only types that
exist and neither includes transfers (API_CONTRACT.md section 9).

Budget figures reuse ``khaata.apps.budgets.services`` (``calculate_budget_spending``
and ``classify_utilization``); the rules are not re-implemented here.
"""
from decimal import Decimal

from django.db.models import Sum

from khaata.apps.books.models import Book, BookType
from khaata.apps.budgets.models import Budget, BudgetScope
from khaata.apps.budgets.services import (
    calculate_budget_spending,
    classify_utilization,
    month_bounds,
)
from khaata.apps.transactions.models import Transaction, TransactionType

ZERO = Decimal("0.00")
CURRENCY = "INR"
RECENT_TRANSACTION_LIMIT = 5
UNCATEGORISED = "Uncategorised"
STATUS_NOT_SET = "NOT_SET"

# Fixed order of the book-type breakdown; all three are always returned.
BOOK_TYPE_ORDER = (BookType.MONTHLY, BookType.EVENT, BookType.GENERAL)
_TYPE_KEY = {TransactionType.INCOME: "income", TransactionType.EXPENSE: "expenses"}


def _owned_transactions(user):
    """Active transactions of every book owned by ``user``."""
    return Transaction.objects.filter(book__owner=user)


def _month_transactions(user, year: int, month: int):
    first, next_first = month_bounds(year, month)
    return _owned_transactions(user).filter(
        transaction_date__gte=first, transaction_date__lt=next_first
    )


def _totals_by_book_type(queryset) -> dict:
    """``{book_type: {"income": Decimal, "expenses": Decimal}}`` for all three types."""
    result = {
        book_type: {"income": ZERO, "expenses": ZERO} for book_type in BOOK_TYPE_ORDER
    }
    rows = queryset.order_by().values("book__type", "type").annotate(total=Sum("amount"))
    for row in rows:
        key = _TYPE_KEY.get(row["type"])
        if key is None:  # only INCOME/EXPENSE ever count
            continue
        result[row["book__type"]][key] += row["total"] or ZERO
    return result


def _category_breakdown(queryset) -> list[dict]:
    """
    Expense totals grouped by category, largest first. Income is ignored.
    Uncategorised expenses form one row with ``category_id`` ``None``. Ties are
    broken by name then id so the order is deterministic.
    """
    rows = (
        queryset.filter(type=TransactionType.EXPENSE)
        .order_by()
        .values("category_id", "category__name")
        .annotate(total=Sum("amount"))
    )
    items = [
        {
            "category_id": row["category_id"],
            "category_name": row["category__name"] if row["category_id"] else UNCATEGORISED,
            "total": row["total"] or ZERO,
        }
        for row in rows
    ]
    items.sort(key=lambda item: (-item["total"], item["category_name"], str(item["category_id"])))
    return items


def budget_summary(budget: Budget | None) -> dict:
    """
    Compact budget block shared by the monthly dashboard. ``None`` (no budget)
    yields the report-only ``NOT_SET`` state with null figures.
    """
    if budget is None:
        return {
            "total_limit": None,
            "spent": None,
            "remaining": None,
            "utilization_percent": None,
            "status": STATUS_NOT_SET,
        }
    spent = calculate_budget_spending(budget)["total"]
    figures = classify_utilization(budget.total_limit, spent)
    return {
        "total_limit": budget.total_limit,
        "spent": spent,
        "remaining": figures["remaining"],
        "utilization_percent": figures["utilization_percent"],
        "status": figures["status"],
    }


def get_monthly_budget(user, year: int, month: int) -> Budget | None:
    return Budget.objects.filter(
        owner=user, scope=BudgetScope.MONTHLY_OVERALL, year=year, month=month
    ).first()


def get_event_budget(user, book: Book) -> Budget | None:
    """Event budget of an owned EVENT book; ``None`` for other book types."""
    if book.type != BookType.EVENT:
        return None
    return Budget.objects.filter(owner=user, scope=BudgetScope.EVENT, book=book).first()


def monthly_report(user, year: int, month: int) -> dict:
    """
    Combined monthly dashboard: active transactions of ALL the user's books
    dated inside the calendar month, each counted exactly once (a transaction
    belongs to exactly one book, and the only join is the many-to-one book FK).
    """
    queryset = _month_transactions(user, year, month)

    by_book_type = _totals_by_book_type(queryset)
    income_total = sum((v["income"] for v in by_book_type.values()), ZERO)
    expense_total = sum((v["expenses"] for v in by_book_type.values()), ZERO)

    recent = list(
        queryset.select_related("category", "payment_method").order_by(
            "-transaction_date", "-created_at", "-id"
        )[:RECENT_TRANSACTION_LIMIT]
    )

    return {
        "period": {"year": year, "month": month},
        "currency": CURRENCY,
        "income_total": income_total,
        "expense_total": expense_total,
        "net_cash_flow": income_total - expense_total,
        "book_type_breakdown": [
            {
                "book_type": book_type,
                "income": by_book_type[book_type]["income"],
                "expenses": by_book_type[book_type]["expenses"],
            }
            for book_type in BOOK_TYPE_ORDER
        ],
        "category_breakdown": _category_breakdown(queryset),
        "budget": budget_summary(get_monthly_budget(user, year, month)),
        "recent_transactions": recent,
    }


def book_report(user, book_id) -> dict:
    """
    Report for one owned book (any lifecycle state, archived included).
    Raises ``Book.DoesNotExist`` when the book is missing or owned by someone
    else (the view maps both to an identical 404).

    ``closing_balance = opening_balance + income_total - expense_total``
    (BR-06); the opening balance is not income and is never carried over.
    """
    book = Book.objects.get(id=book_id, owner=user)
    queryset = _owned_transactions(user).filter(book=book)

    totals = _totals_by_book_type(queryset)[book.type]
    income_total, expense_total = totals["income"], totals["expenses"]

    return {
        "book": book,
        "income_total": income_total,
        "expense_total": expense_total,
        "net_cash_flow": income_total - expense_total,
        "closing_balance": book.opening_balance + income_total - expense_total,
        "category_breakdown": _category_breakdown(queryset),
        "budget": get_event_budget(user, book),
    }


def budget_utilization_report(user, year: int, month: int) -> dict:
    """Period plus the monthly overall budget (``None`` when not set)."""
    return {
        "period": {"year": year, "month": month},
        "budget": get_monthly_budget(user, year, month),
    }
