"""
Service functions for budgets and allocations (BE-006).

Write paths (``create_budget``, ``update_budget``, ``replace_allocations``) are
atomic and, where the cross-row rule "sum(allocations) <= total_limit" is
involved, lock the parent budget row with ``select_for_update()`` first
(DATABASE_DESIGN.md sections 3 and 6). All lookups are owner-scoped; a budget
that is missing or owned by another user raises ``Budget.DoesNotExist`` (views
map this to 404).

Read path (``calculate_budget_spending`` / ``classify_utilization``) derives
spending from active transactions every time; nothing derived is stored
(AGENTS.md section 4). Budgets are soft caps: no transaction write is ever
rejected because of a budget (ADR-012).
"""
import datetime
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum

from khaata.apps.books.models import Book, BookType
from khaata.apps.budgets.models import Budget, BudgetAllocation, BudgetScope
from khaata.apps.transactions.models import Category, CategoryType, Transaction, TransactionType

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
HUNDRED = Decimal("100")

# Shared contract threshold (API_CONTRACT.md section 7: baseline >=80% and <=100%).
NEAR_LIMIT_PERCENT = Decimal("80")

# Same bounds as ensure_monthly_book so a monthly budget year is always one a
# monthly book could exist for.
MIN_YEAR = 2000
MAX_YEAR = 2200

STATUS_ON_TRACK = "ON_TRACK"
STATUS_NEAR_LIMIT = "NEAR_LIMIT"
STATUS_OVER_BUDGET = "OVER_BUDGET"
STATUS_UNBUDGETED_SPENDING = "UNBUDGETED_SPENDING"

class AllocationItemError(ValidationError):
    """
    Per-item allocation errors. ``details`` is DRF-shaped and keyed by the item
    index, matching the request serializer's own errors:
    ``{"allocations": {<index>: {"category_id": ["..."]}}}``.
    """

    def __init__(self, item_errors: dict):
        super().__init__("One or more allocations are invalid.")
        self.details = {"allocations": item_errors}


_DUPLICATE_MONTHLY = "A monthly overall budget already exists for this month."
_DUPLICATE_EVENT = "An event budget already exists for this book."


# ---------------------------------------------------------------------------
# Derived calculations (read-only)
# ---------------------------------------------------------------------------
def _quantize(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def classify_utilization(limit: Decimal, spent: Decimal) -> dict:
    """
    Return ``remaining``, ``utilization_percent`` and ``status`` for a limit and
    the amount spent against it. Decimal arithmetic only; never divides by zero.

    * remaining = limit - spent (negative when overspent).
    * limit > 0: utilization = spent / limit * 100 (rounded half-up to 2 dp for
      display); status is chosen from the exact ratio, not the rounded one:
      OVER_BUDGET (> 100%), NEAR_LIMIT (>= 80% and <= 100%), else ON_TRACK.
    * limit == 0, spent == 0: ON_TRACK, utilization "0.00".
    * limit == 0, spent > 0: UNBUDGETED_SPENDING, utilization ``None``.
    """
    remaining = limit - spent
    if limit > 0:
        percent = _quantize(spent * HUNDRED / limit)
        if spent > limit:
            status = STATUS_OVER_BUDGET
        elif spent * HUNDRED >= limit * NEAR_LIMIT_PERCENT:
            status = STATUS_NEAR_LIMIT
        else:
            status = STATUS_ON_TRACK
    elif spent > 0:
        percent = None
        status = STATUS_UNBUDGETED_SPENDING
    else:
        percent = ZERO
        status = STATUS_ON_TRACK
    return {"remaining": remaining, "utilization_percent": percent, "status": status}


def _month_bounds(year: int, month: int) -> tuple[datetime.date, datetime.date]:
    """Half-open [first_day, first_day_of_next_month) date range."""
    first = datetime.date(year, month, 1)
    if month == 12:
        return first, datetime.date(year + 1, 1, 1)
    return first, datetime.date(year, month + 1, 1)


def _budget_expense_queryset(budget: Budget):
    """
    Active EXPENSE transactions that count against ``budget``.

    * MONTHLY_OVERALL: every book owned by the budget owner (any type, archived
      or not) whose transaction_date falls inside the calendar month.
    * EVENT: the event book only, regardless of transaction date.

    ``Transaction.objects`` excludes soft-deleted rows. The only join is the
    many-to-one ``book`` FK, so a transaction can never be counted twice.
    """
    queryset = Transaction.objects.filter(
        book__owner_id=budget.owner_id, type=TransactionType.EXPENSE
    )
    if budget.scope == BudgetScope.MONTHLY_OVERALL:
        first, next_first = _month_bounds(budget.year, budget.month)
        return queryset.filter(transaction_date__gte=first, transaction_date__lt=next_first)
    return queryset.filter(book_id=budget.book_id)


def calculate_budget_spending(budget: Budget) -> dict:
    """
    Return ``{"total": Decimal, "by_category": {category_id|None: Decimal}}``.

    One grouped aggregate query; the total is the sum of the groups (including
    the uncategorised ``None`` group), so the two can never disagree.
    """
    by_category: dict = defaultdict(lambda: ZERO)
    rows = _budget_expense_queryset(budget).order_by().values("category_id").annotate(
        spent=Sum("amount")
    )
    for row in rows:
        by_category[row["category_id"]] += row["spent"] or ZERO
    return {"total": sum(by_category.values(), ZERO), "by_category": dict(by_category)}


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------
def _validate_year_month(year, month) -> None:
    errors = {}
    if year is None or not (MIN_YEAR <= year <= MAX_YEAR):
        errors["year"] = [f"Year must be between {MIN_YEAR} and {MAX_YEAR}."]
    if month is None or not (1 <= month <= 12):
        errors["month"] = ["Month must be between 1 and 12."]
    if errors:
        raise ValidationError(errors)


def _monthly_exists(owner, year, month, exclude_id=None) -> bool:
    queryset = Budget.objects.filter(
        owner=owner, scope=BudgetScope.MONTHLY_OVERALL, year=year, month=month
    )
    if exclude_id is not None:
        queryset = queryset.exclude(pk=exclude_id)
    return queryset.exists()


def create_budget(user, data: dict) -> Budget:
    """
    Create a MONTHLY_OVERALL or EVENT budget for ``user``.

    * MONTHLY_OVERALL: ``year`` + ``month`` required, ``book_id`` not allowed;
      one per (owner, year, month). No monthly book needs to exist.
    * EVENT: ``book_id`` required and must be one of the user's EVENT books,
      ``year``/``month`` not allowed; one per book.
    * Body references to missing or foreign books yield an identical generic
      error (no cross-user disclosure), matching the BE-005 convention.
    """
    scope = data["scope"]
    total_limit = data["total_limit"]

    if scope == BudgetScope.MONTHLY_OVERALL:
        if data.get("book_id") is not None:
            raise ValidationError({"book_id": ["Not applicable to a monthly overall budget."]})
        year, month, book = data.get("year"), data.get("month"), None
        _validate_year_month(year, month)
        duplicate_message, duplicate_field = _DUPLICATE_MONTHLY, "month"
    else:
        errors = {
            field: ["Not applicable to an event budget."]
            for field in ("year", "month")
            if data.get(field) is not None
        }
        if errors:
            raise ValidationError(errors)
        if data.get("book_id") is None:
            raise ValidationError({"book_id": ["This field is required for an event budget."]})
        try:
            book = Book.objects.get(id=data["book_id"], owner=user)
        except Book.DoesNotExist:
            raise ValidationError({"book_id": ["Book not found."]})
        if book.type != BookType.EVENT:
            raise ValidationError({"book_id": ["Event budgets can only be set on event books."]})
        year = month = None
        duplicate_message, duplicate_field = _DUPLICATE_EVENT, "book_id"

    def _duplicate_exists() -> bool:
        if scope == BudgetScope.MONTHLY_OVERALL:
            return _monthly_exists(user, year, month)
        return Budget.objects.filter(scope=BudgetScope.EVENT, book=book).exists()

    if _duplicate_exists():
        raise ValidationError({duplicate_field: [duplicate_message]})

    try:
        with transaction.atomic():
            return Budget.objects.create(
                owner=user,
                scope=scope,
                book=book,
                year=year,
                month=month,
                total_limit=total_limit,
            )
    except IntegrityError:
        # A concurrent request won the race; the partial unique constraint is
        # authoritative. Anything else is unexpected and is re-raised.
        if _duplicate_exists():
            raise ValidationError({duplicate_field: [duplicate_message]})
        raise


def _allocated_total(budget: Budget) -> Decimal:
    total = ZERO
    for amount in budget.allocations.values_list("amount", flat=True):
        total += amount
    return total


def update_budget(user, budget_id, data: dict) -> Budget:
    """
    Partial update of ``total_limit`` and, for MONTHLY_OVERALL budgets, the
    ``year``/``month`` period. ``scope`` and ``book_id`` are immutable (a
    differing value is rejected).

    The budget row is locked; ``total_limit`` may not drop below the current
    allocation total. Existing spending above a reduced limit is allowed - the
    over-budget status is derived on read.

    Raises ``Budget.DoesNotExist`` for a missing or foreign budget.
    """
    with transaction.atomic():
        budget = Budget.objects.select_for_update().get(pk=budget_id, owner=user)

        if "scope" in data and data["scope"] != budget.scope:
            raise ValidationError({"scope": ["Budget scope cannot be changed."]})
        if "book_id" in data and data["book_id"] != budget.book_id:
            raise ValidationError({"book_id": ["Budget book cannot be changed."]})

        if budget.scope == BudgetScope.EVENT:
            errors = {
                field: ["Not applicable to an event budget."]
                for field in ("year", "month")
                if data.get(field) is not None
            }
            if errors:
                raise ValidationError(errors)
        elif "year" in data or "month" in data:
            year = data.get("year", budget.year)
            month = data.get("month", budget.month)
            _validate_year_month(year, month)
            if (year, month) != (budget.year, budget.month):
                if _monthly_exists(user, year, month, exclude_id=budget.pk):
                    raise ValidationError({"month": [_DUPLICATE_MONTHLY]})
                budget.year, budget.month = year, month

        if "total_limit" in data:
            allocated = _allocated_total(budget)
            if data["total_limit"] < allocated:
                raise ValidationError(
                    {"total_limit": ["Total limit cannot be lower than the allocated total."]}
                )
            budget.total_limit = data["total_limit"]

        try:
            with transaction.atomic():
                budget.save()
        except IntegrityError:
            if budget.scope == BudgetScope.MONTHLY_OVERALL and _monthly_exists(
                user, budget.year, budget.month, exclude_id=budget.pk
            ):
                raise ValidationError({"month": [_DUPLICATE_MONTHLY]})
            raise
        return budget


def replace_allocations(user, budget_id, allocations: list[dict]) -> Budget:
    """
    Atomically replace every category allocation of a budget.

    Rules (API_CONTRACT.md section 6 / BR-04): each category appears at most
    once; amounts are non-negative; every category must be an active EXPENSE
    category owned by the user; the sum must not exceed ``total_limit``. An
    empty list removes all allocations. The parent budget row is locked for the
    whole validate-and-replace so concurrent replacements cannot oversubscribe
    it. Any failure leaves the previous allocations untouched.

    Raises ``Budget.DoesNotExist`` for a missing or foreign budget.
    """
    with transaction.atomic():
        budget = Budget.objects.select_for_update().get(pk=budget_id, owner=user)

        category_ids = [item["category_id"] for item in allocations]
        errors = {}
        seen = set()
        for index, category_id in enumerate(category_ids):
            if category_id in seen:
                errors[index] = {"category_id": ["Each category may appear only once."]}
            seen.add(category_id)
        if errors:
            raise AllocationItemError(errors)

        categories = {
            c.id: c for c in Category.objects.filter(owner=user, id__in=set(category_ids))
        }
        for index, category_id in enumerate(category_ids):
            category = categories.get(category_id)
            if category is None:
                message = "Category not found."
            elif category.type != CategoryType.EXPENSE:
                message = "Only expense categories can be allocated."
            elif not category.is_active:
                message = "Category is inactive and cannot be allocated."
            else:
                continue
            errors[index] = {"category_id": [message]}
        if errors:
            raise AllocationItemError(errors)

        total = sum((item["amount"] for item in allocations), ZERO)
        if total > budget.total_limit:
            raise ValidationError(
                {"allocations": ["Allocation total exceeds the budget total limit."]}
            )

        budget.allocations.all().delete()
        BudgetAllocation.objects.bulk_create(
            [
                BudgetAllocation(
                    budget=budget, category=categories[item["category_id"]], amount=item["amount"]
                )
                for item in allocations
            ]
        )
        return budget
