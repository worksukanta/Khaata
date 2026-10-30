"""
Model and service tests for budgets and allocations (BE-006).
"""
import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from khaata.apps.books.models import BookType
from khaata.apps.books.services import archive_book, create_book, ensure_monthly_book
from khaata.apps.budgets.models import Budget, BudgetAllocation, BudgetScope
from khaata.apps.budgets.services import (
    calculate_budget_spending,
    classify_utilization,
    create_budget,
    replace_allocations,
    update_budget,
)
from khaata.apps.transactions.models import Category, Transaction
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()
D = Decimal
DATE = datetime.date

MONTHLY = BudgetScope.MONTHLY_OVERALL
EVENT = BudgetScope.EVENT


@pytest.fixture
def user():
    return User.objects.create_user(email="bud1@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="bud2@example.com", password="SecurePassword123!")


@pytest.fixture
def food(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


@pytest.fixture
def travel(user):
    return Category.objects.create(owner=user, name="Travel", type="EXPENSE")


@pytest.fixture
def salary(user):
    return Category.objects.create(owner=user, name="Salary", type="INCOME")


@pytest.fixture
def event_book(user):
    return create_book(user, {"type": BookType.EVENT, "name": "Puja"})


@pytest.fixture
def general_book(user):
    return create_book(user, {"type": BookType.GENERAL, "name": "Misc"})


def _monthly(user, limit="20000.00", year=2026, month=10):
    return create_budget(
        user, {"scope": MONTHLY, "year": year, "month": month, "total_limit": D(limit)}
    )


def _event(user, book, limit="10000.00"):
    return create_budget(user, {"scope": EVENT, "book_id": book.id, "total_limit": D(limit)})


def _spend(user, book, amount, date, category=None, txn_type="EXPENSE"):
    data = {
        "book_id": book.id,
        "type": txn_type,
        "amount": D(amount),
        "transaction_date": date,
    }
    if category is not None:
        data["category_id"] = category.id
    return create_transaction(user, data)


def _alloc(*pairs):
    return [{"category_id": c.id, "amount": D(a)} for c, a in pairs]


# ---------------------------------------------------------------------------
# classify_utilization
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "limit,spent,remaining,percent,status",
    [
        ("20000.00", "0.00", "20000.00", "0.00", "ON_TRACK"),
        ("20000.00", "16000.00", "4000.00", "80.00", "NEAR_LIMIT"),
        ("20000.00", "20000.00", "0.00", "100.00", "NEAR_LIMIT"),
        ("20000.00", "20000.01", "-0.01", "100.00", "OVER_BUDGET"),
        ("20000.00", "24800.00", "-4800.00", "124.00", "OVER_BUDGET"),
        ("0.00", "0.00", "0.00", "0.00", "ON_TRACK"),
        ("0.00", "50.00", "-50.00", None, "UNBUDGETED_SPENDING"),
        ("3.00", "1.00", "2.00", "33.33", "ON_TRACK"),
    ],
)
def test_classify_utilization(limit, spent, remaining, percent, status):
    result = classify_utilization(D(limit), D(spent))
    assert result["remaining"] == D(remaining)
    assert result["utilization_percent"] == (None if percent is None else D(percent))
    assert result["status"] == status


def test_status_uses_exact_ratio_not_rounded_percent():
    # 15999.99 / 20000 = 79.99995% displays as 80.00 but is below the 80% threshold.
    result = classify_utilization(D("20000.00"), D("15999.99"))
    assert result["utilization_percent"] == D("80.00")
    assert result["status"] == "ON_TRACK"
    # Exactly 100% is NEAR_LIMIT, not OVER_BUDGET.
    assert classify_utilization(D("5.00"), D("5.00"))["status"] == "NEAR_LIMIT"


def test_classify_utilization_uses_decimal_only():
    result = classify_utilization(D("0.30"), D("0.10"))
    assert isinstance(result["remaining"], Decimal) and result["remaining"] == D("0.20")
    assert result["utilization_percent"] == D("33.33")


# ---------------------------------------------------------------------------
# create_budget
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_monthly_budget_without_monthly_book(user):
    budget = _monthly(user)
    assert budget.scope == MONTHLY and budget.book is None
    assert (budget.year, budget.month, budget.total_limit) == (2026, 10, D("20000.00"))
    assert budget.owner == user


@pytest.mark.django_db
def test_create_event_budget(user, event_book):
    budget = _event(user, event_book)
    assert budget.scope == EVENT and budget.book == event_book
    assert budget.year is None and budget.month is None


@pytest.mark.django_db
def test_zero_limit_is_allowed(user):
    assert _monthly(user, "0.00").total_limit == D("0.00")


@pytest.mark.django_db
@pytest.mark.parametrize("year,month", [(None, 10), (2026, None), (1999, 10), (2201, 10), (2026, 0), (2026, 13)])
def test_monthly_requires_valid_period(user, year, month):
    with pytest.raises(ValidationError):
        create_budget(user, {"scope": MONTHLY, "year": year, "month": month, "total_limit": D("1")})
    assert Budget.objects.count() == 0


@pytest.mark.django_db
def test_monthly_rejects_book_id(user, event_book):
    with pytest.raises(ValidationError) as exc:
        create_budget(
            user,
            {"scope": MONTHLY, "year": 2026, "month": 10, "book_id": event_book.id, "total_limit": D("1")},
        )
    assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_event_requires_book_id(user):
    with pytest.raises(ValidationError) as exc:
        create_budget(user, {"scope": EVENT, "total_limit": D("1")})
    assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_event_rejects_year_month(user, event_book):
    with pytest.raises(ValidationError) as exc:
        create_budget(
            user, {"scope": EVENT, "book_id": event_book.id, "year": 2026, "month": 10, "total_limit": D("1")}
        )
    assert {"year", "month"} <= set(exc.value.message_dict)


@pytest.mark.django_db
def test_event_budget_rejects_non_event_books(user, general_book):
    october = ensure_monthly_book(user, 2026, 10)[0]
    for book in (general_book, october):
        with pytest.raises(ValidationError) as exc:
            _event(user, book)
        assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_event_budget_rejects_foreign_and_unknown_books_identically(user, other_user):
    foreign = create_book(other_user, {"type": BookType.EVENT, "name": "Theirs"})
    import uuid

    messages = []
    for book_id in (foreign.id, uuid.uuid4()):
        with pytest.raises(ValidationError) as exc:
            create_budget(user, {"scope": EVENT, "book_id": book_id, "total_limit": D("1")})
        messages.append(exc.value.message_dict)
    assert messages[0] == messages[1] == {"book_id": ["Book not found."]}
    assert Budget.objects.count() == 0


@pytest.mark.django_db
def test_duplicate_monthly_budget_rejected_per_owner_month(user, other_user):
    _monthly(user)
    with pytest.raises(ValidationError) as exc:
        _monthly(user, "5.00")
    assert "month" in exc.value.message_dict
    # Another user, or another month, is fine.
    _monthly(other_user)
    _monthly(user, month=11)
    assert Budget.objects.count() == 3


@pytest.mark.django_db
def test_duplicate_event_budget_rejected(user, event_book):
    _event(user, event_book)
    with pytest.raises(ValidationError) as exc:
        _event(user, event_book, "5.00")
    assert "book_id" in exc.value.message_dict
    assert Budget.objects.count() == 1


# ---------------------------------------------------------------------------
# Database constraints (SQLite here; PostgreSQL not exercised)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_db_unique_monthly_budget(user):
    Budget.objects.create(owner=user, scope=MONTHLY, year=2026, month=10, total_limit=D("1"))
    with pytest.raises(IntegrityError), transaction.atomic():
        Budget.objects.create(owner=user, scope=MONTHLY, year=2026, month=10, total_limit=D("2"))


@pytest.mark.django_db
def test_db_unique_event_budget_per_book(user, event_book):
    Budget.objects.create(owner=user, scope=EVENT, book=event_book, total_limit=D("1"))
    with pytest.raises(IntegrityError), transaction.atomic():
        Budget.objects.create(owner=user, scope=EVENT, book=event_book, total_limit=D("2"))


@pytest.mark.django_db
@pytest.mark.parametrize(
    "kwargs",
    [
        {"scope": "BOGUS", "year": 2026, "month": 10},
        {"scope": MONTHLY, "year": None, "month": None},
        {"scope": MONTHLY, "year": 2026, "month": 13},
        {"scope": EVENT, "year": None, "month": None},  # event without book
        {"scope": MONTHLY, "year": 2026, "month": 10, "total_limit": D("-0.01")},
    ],
)
def test_db_budget_check_constraints(user, kwargs):
    kwargs.setdefault("total_limit", D("1.00"))
    with pytest.raises(IntegrityError), transaction.atomic():
        Budget.objects.create(owner=user, **kwargs)


@pytest.mark.django_db
def test_db_event_budget_with_year_month_rejected(user, event_book):
    with pytest.raises(IntegrityError), transaction.atomic():
        Budget.objects.create(
            owner=user, scope=EVENT, book=event_book, year=2026, month=10, total_limit=D("1")
        )


@pytest.mark.django_db
def test_db_monthly_budget_with_book_rejected(user, event_book):
    with pytest.raises(IntegrityError), transaction.atomic():
        Budget.objects.create(
            owner=user, scope=MONTHLY, book=event_book, year=2026, month=10, total_limit=D("1")
        )


@pytest.mark.django_db
def test_db_allocation_constraints(user, food):
    budget = _monthly(user)
    BudgetAllocation.objects.create(budget=budget, category=food, amount=D("1.00"))
    with pytest.raises(IntegrityError), transaction.atomic():
        BudgetAllocation.objects.create(budget=budget, category=food, amount=D("2.00"))
    other = Category.objects.create(owner=user, name="Other", type="EXPENSE")
    with pytest.raises(IntegrityError), transaction.atomic():
        BudgetAllocation.objects.create(budget=budget, category=other, amount=D("-1.00"))


@pytest.mark.django_db
def test_protect_and_cascade_relationships(user, food, event_book):
    event_budget = _event(user, event_book)
    monthly = _monthly(user)
    replace_allocations(user, monthly.id, _alloc((food, "10.00")))
    with pytest.raises(ProtectedError):
        food.delete()  # allocation references it
    with pytest.raises(ProtectedError):
        event_book.delete()  # event budget references it
    monthly.delete()
    assert BudgetAllocation.objects.count() == 0
    assert Budget.objects.filter(pk=event_budget.pk).exists()


# ---------------------------------------------------------------------------
# update_budget
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_update_total_limit(user):
    budget = _monthly(user)
    updated = update_budget(user, budget.id, {"total_limit": D("30000.00")})
    assert updated.total_limit == D("30000.00")
    budget.refresh_from_db()
    assert budget.total_limit == D("30000.00")


@pytest.mark.django_db
def test_update_limit_below_existing_spending_is_allowed(user, food):
    budget = _monthly(user)
    book = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, book, "5000.00", DATE(2026, 10, 5), food)
    update_budget(user, budget.id, {"total_limit": D("1000.00")})
    spending = calculate_budget_spending(budget)
    assert spending["total"] == D("5000.00")
    assert classify_utilization(D("1000.00"), spending["total"])["status"] == "OVER_BUDGET"


@pytest.mark.django_db
def test_update_limit_below_allocated_total_rejected(user, food, travel):
    budget = _monthly(user, "1000.00")
    replace_allocations(user, budget.id, _alloc((food, "600.00"), (travel, "300.00")))
    with pytest.raises(ValidationError) as exc:
        update_budget(user, budget.id, {"total_limit": D("899.99")})
    assert "total_limit" in exc.value.message_dict
    budget.refresh_from_db()
    assert budget.total_limit == D("1000.00")
    # Exactly the allocated total is fine.
    assert update_budget(user, budget.id, {"total_limit": D("900.00")}).total_limit == D("900.00")


@pytest.mark.django_db
def test_update_monthly_period(user):
    budget = _monthly(user)
    updated = update_budget(user, budget.id, {"year": 2027, "month": 1})
    assert (updated.year, updated.month) == (2027, 1)


@pytest.mark.django_db
def test_update_period_conflict_rejected(user):
    _monthly(user, month=11)
    budget = _monthly(user)
    with pytest.raises(ValidationError) as exc:
        update_budget(user, budget.id, {"month": 11})
    assert "month" in exc.value.message_dict
    budget.refresh_from_db()
    assert budget.month == 10


@pytest.mark.django_db
def test_update_invalid_period_rejected(user):
    budget = _monthly(user)
    with pytest.raises(ValidationError):
        update_budget(user, budget.id, {"month": 13})
    with pytest.raises(ValidationError):
        update_budget(user, budget.id, {"year": None})


@pytest.mark.django_db
def test_update_same_period_is_noop_not_duplicate(user):
    budget = _monthly(user)
    assert update_budget(user, budget.id, {"year": 2026, "month": 10}).month == 10


@pytest.mark.django_db
def test_update_scope_and_book_are_immutable(user, event_book):
    monthly = _monthly(user)
    event = _event(user, event_book)
    other_event = create_book(user, {"type": BookType.EVENT, "name": "Other"})
    with pytest.raises(ValidationError):
        update_budget(user, monthly.id, {"scope": EVENT})
    with pytest.raises(ValidationError):
        update_budget(user, event.id, {"book_id": other_event.id})
    # Same value is accepted.
    assert update_budget(user, event.id, {"book_id": event_book.id, "scope": EVENT}).book == event_book


@pytest.mark.django_db
def test_update_event_budget_rejects_period(user, event_book):
    event = _event(user, event_book)
    with pytest.raises(ValidationError):
        update_budget(user, event.id, {"year": 2026})
    # Explicit nulls are harmless.
    assert update_budget(user, event.id, {"year": None, "month": None}).year is None


@pytest.mark.django_db
def test_update_foreign_budget_not_found(user, other_user):
    budget = _monthly(other_user)
    with pytest.raises(Budget.DoesNotExist):
        update_budget(user, budget.id, {"total_limit": D("1")})
    budget.refresh_from_db()
    assert budget.total_limit == D("20000.00")


# ---------------------------------------------------------------------------
# replace_allocations
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_replace_allocations_creates_rows(user, food, travel):
    budget = _monthly(user)
    replace_allocations(user, budget.id, _alloc((food, "5000.00"), (travel, "1500.00")))
    rows = {a.category_id: a.amount for a in budget.allocations.all()}
    assert rows == {food.id: D("5000.00"), travel.id: D("1500.00")}


@pytest.mark.django_db
def test_replace_is_full_replacement(user, food, travel):
    budget = _monthly(user)
    replace_allocations(user, budget.id, _alloc((food, "5000.00"), (travel, "1500.00")))
    replace_allocations(user, budget.id, _alloc((food, "100.00")))
    assert list(budget.allocations.values_list("category_id", "amount")) == [(food.id, D("100.00"))]


@pytest.mark.django_db
def test_replace_with_empty_list_clears(user, food):
    budget = _monthly(user)
    replace_allocations(user, budget.id, _alloc((food, "100.00")))
    replace_allocations(user, budget.id, [])
    assert budget.allocations.count() == 0


@pytest.mark.django_db
def test_allocations_may_equal_limit_and_be_zero(user, food, travel):
    budget = _monthly(user, "100.00")
    replace_allocations(user, budget.id, _alloc((food, "100.00"), (travel, "0.00")))
    assert budget.allocations.count() == 2


@pytest.mark.django_db
def test_allocation_total_exceeding_limit_rejected_and_rolled_back(user, food, travel):
    budget = _monthly(user, "100.00")
    replace_allocations(user, budget.id, _alloc((food, "40.00")))
    with pytest.raises(ValidationError) as exc:
        replace_allocations(user, budget.id, _alloc((food, "60.00"), (travel, "40.01")))
    assert "allocations" in exc.value.message_dict
    assert list(budget.allocations.values_list("category_id", "amount")) == [(food.id, D("40.00"))]


@pytest.mark.django_db
def test_zero_limit_budget_rejects_positive_allocation(user, food):
    budget = _monthly(user, "0.00")
    with pytest.raises(ValidationError):
        replace_allocations(user, budget.id, _alloc((food, "0.01")))
    replace_allocations(user, budget.id, _alloc((food, "0.00")))
    assert budget.allocations.count() == 1


@pytest.mark.django_db
def test_duplicate_category_in_payload_rejected(user, food):
    budget = _monthly(user)
    with pytest.raises(ValidationError):
        replace_allocations(user, budget.id, _alloc((food, "1.00"), (food, "2.00")))
    assert budget.allocations.count() == 0


@pytest.mark.django_db
def test_income_category_rejected(user, salary):
    budget = _monthly(user)
    with pytest.raises(ValidationError):
        replace_allocations(user, budget.id, _alloc((salary, "1.00")))


@pytest.mark.django_db
def test_inactive_category_rejected_for_new_allocation(user, food):
    food.is_active = False
    food.save()
    budget = _monthly(user)
    with pytest.raises(ValidationError):
        replace_allocations(user, budget.id, _alloc((food, "1.00")))


@pytest.mark.django_db
def test_foreign_and_unknown_categories_rejected_identically(user, other_user):
    import uuid

    theirs = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    budget = _monthly(user)
    errors = []
    for category_id in (theirs.id, uuid.uuid4()):
        with pytest.raises(ValidationError) as exc:
            replace_allocations(user, budget.id, [{"category_id": category_id, "amount": D("1")}])
        errors.append(exc.value.details)
    assert errors[0] == errors[1]
    assert budget.allocations.count() == 0


@pytest.mark.django_db
def test_replace_on_foreign_budget_not_found(user, other_user, food):
    budget = _monthly(other_user)
    with pytest.raises(Budget.DoesNotExist):
        replace_allocations(user, budget.id, _alloc((food, "1.00")))
    assert budget.allocations.count() == 0


@pytest.mark.django_db
def test_existing_allocation_survives_category_deactivation(user, food):
    budget = _monthly(user)
    replace_allocations(user, budget.id, _alloc((food, "100.00")))
    food.is_active = False
    food.save()
    assert budget.allocations.count() == 1
    # A full replacement that still includes the now-inactive category is a new selection -> rejected.
    with pytest.raises(ValidationError):
        replace_allocations(user, budget.id, _alloc((food, "100.00")))
    assert budget.allocations.count() == 1


# ---------------------------------------------------------------------------
# Spending calculation / transaction integration
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_expense_counts_income_does_not(user, food, salary):
    budget = _monthly(user)
    book = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, book, "250.00", DATE(2026, 10, 5), food)
    _spend(user, book, "99999.00", DATE(2026, 10, 5), salary, txn_type="INCOME")
    assert calculate_budget_spending(budget)["total"] == D("250.00")


@pytest.mark.django_db
def test_soft_deleted_transactions_excluded(user, food):
    budget = _monthly(user)
    book = ensure_monthly_book(user, 2026, 10)[0]
    keep = _spend(user, book, "100.00", DATE(2026, 10, 5), food)
    gone = _spend(user, book, "40.00", DATE(2026, 10, 6), food)
    soft_delete_transaction(user, gone.id)
    spending = calculate_budget_spending(budget)
    assert spending["total"] == keep.amount == D("100.00")
    assert spending["by_category"] == {food.id: D("100.00")}


@pytest.mark.django_db
def test_no_transactions_gives_zero(user):
    spending = calculate_budget_spending(_monthly(user))
    assert spending == {"total": D("0.00"), "by_category": {}}


@pytest.mark.django_db
def test_monthly_budget_spans_all_book_types_without_double_counting(
    user, food, event_book, general_book
):
    budget = _monthly(user)
    october = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, october, "100.00", DATE(2026, 10, 3), food)
    _spend(user, event_book, "200.00", DATE(2026, 10, 4), food)
    _spend(user, general_book, "300.00", DATE(2026, 10, 5), None)
    spending = calculate_budget_spending(budget)
    assert spending["total"] == D("600.00")
    assert spending["by_category"] == {food.id: D("300.00"), None: D("300.00")}
    assert sum(spending["by_category"].values()) == spending["total"]


@pytest.mark.django_db
def test_event_expense_counts_once_in_each_budget_scope(user, food, event_book):
    monthly = _monthly(user)
    event = _event(user, event_book)
    _spend(user, event_book, "700.00", DATE(2026, 10, 10), food)
    assert calculate_budget_spending(monthly)["total"] == D("700.00")
    assert calculate_budget_spending(event)["total"] == D("700.00")
    assert Transaction.objects.count() == 1


@pytest.mark.django_db
def test_event_budget_isolated_from_other_books(user, food, event_book, general_book):
    event = _event(user, event_book)
    other_event = create_book(user, {"type": BookType.EVENT, "name": "Wedding"})
    october = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, event_book, "10.00", DATE(2026, 10, 10), food)
    _spend(user, other_event, "20.00", DATE(2026, 10, 10), food)
    _spend(user, general_book, "40.00", DATE(2026, 10, 10), food)
    _spend(user, october, "80.00", DATE(2026, 10, 10), food)
    assert calculate_budget_spending(event)["total"] == D("10.00")


@pytest.mark.django_db
def test_event_budget_counts_across_months_and_ignores_date(user, food, event_book):
    event = _event(user, event_book)
    _spend(user, event_book, "10.00", DATE(2026, 9, 30), food)
    _spend(user, event_book, "20.00", DATE(2026, 10, 1), food)
    _spend(user, event_book, "30.00", DATE(2027, 1, 15), food)
    assert calculate_budget_spending(event)["total"] == D("60.00")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "year,month,inside,outside",
    [
        (2026, 10, [DATE(2026, 10, 1), DATE(2026, 10, 31)], [DATE(2026, 9, 30), DATE(2026, 11, 1)]),
        (2024, 2, [DATE(2024, 2, 1), DATE(2024, 2, 29)], [DATE(2024, 1, 31), DATE(2024, 3, 1)]),
        (2025, 2, [DATE(2025, 2, 28)], [DATE(2025, 3, 1)]),
        (2026, 12, [DATE(2026, 12, 1), DATE(2026, 12, 31)], [DATE(2026, 11, 30), DATE(2027, 1, 1)]),
        (2026, 1, [DATE(2026, 1, 1)], [DATE(2025, 12, 31), DATE(2026, 2, 1)]),
    ],
)
def test_month_boundaries_use_transaction_date(user, general_book, year, month, inside, outside):
    budget = _monthly(user, year=year, month=month)
    # A general book holds transactions of any month, so the date alone decides.
    for date in inside + outside:
        _spend(user, general_book, "1.00", date)
    assert calculate_budget_spending(budget)["total"] == D(len(inside)) * D("1.00")


@pytest.mark.django_db
def test_monthly_budget_uses_transaction_date_not_book_month(user, food):
    """A transaction moved to another month leaves the old month's budget."""
    sept = _monthly(user, month=9)
    october = _monthly(user, month=10)
    book = ensure_monthly_book(user, 2026, 9)[0]
    txn = _spend(user, book, "50.00", DATE(2026, 9, 30), food)
    assert calculate_budget_spending(sept)["total"] == D("50.00")
    from khaata.apps.transactions.services import update_transaction

    update_transaction(user, txn.id, {"transaction_date": DATE(2026, 10, 1)})
    assert calculate_budget_spending(sept)["total"] == D("0.00")
    assert calculate_budget_spending(october)["total"] == D("50.00")


@pytest.mark.django_db
def test_archived_book_transactions_still_count(user, food, event_book):
    monthly = _monthly(user)
    event = _event(user, event_book)
    _spend(user, event_book, "70.00", DATE(2026, 10, 10), food)
    archive_book(event_book)
    assert calculate_budget_spending(monthly)["total"] == D("70.00")
    assert calculate_budget_spending(event)["total"] == D("70.00")


@pytest.mark.django_db
def test_other_users_transactions_never_counted(user, other_user, food):
    budget = _monthly(user)
    theirs_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    theirs = ensure_monthly_book(other_user, 2026, 10)[0]
    _spend(other_user, theirs, "999.00", DATE(2026, 10, 5), theirs_cat)
    assert calculate_budget_spending(budget)["total"] == D("0.00")


@pytest.mark.django_db
def test_category_without_allocation_still_consumes_total(user, food, travel):
    budget = _monthly(user)
    book = ensure_monthly_book(user, 2026, 10)[0]
    replace_allocations(user, budget.id, _alloc((food, "100.00")))
    _spend(user, book, "10.00", DATE(2026, 10, 5), food)
    _spend(user, book, "5.00", DATE(2026, 10, 5), travel)
    _spend(user, book, "2.00", DATE(2026, 10, 5), None)
    spending = calculate_budget_spending(budget)
    assert spending["total"] == D("17.00")
    assert spending["by_category"][None] == D("2.00")


@pytest.mark.django_db
def test_decimal_sums_are_exact(user, general_book):
    budget = _monthly(user)
    for _ in range(10):
        _spend(user, general_book, "0.10", DATE(2026, 10, 5))
    assert calculate_budget_spending(budget)["total"] == D("1.00")


@pytest.mark.django_db
def test_overspending_never_blocks_transactions(user, food):
    _monthly(user, "10.00")
    book = ensure_monthly_book(user, 2026, 10)[0]
    txn = _spend(user, book, "5000.00", DATE(2026, 10, 5), food)
    assert txn.pk is not None
    assert Transaction.objects.count() == 1
