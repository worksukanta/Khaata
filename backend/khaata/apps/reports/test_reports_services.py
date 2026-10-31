"""
Service tests for reports (BE-007): monthly dashboard, book report and
budget utilization. Runs on whatever DB the test settings use (SQLite).
"""
import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import archive_book, create_book, ensure_monthly_book
from khaata.apps.budgets.models import BudgetScope
from khaata.apps.budgets.services import create_budget, month_bounds
from khaata.apps.reports.services import (
    book_report,
    budget_summary,
    budget_utilization_report,
    monthly_report,
)
from khaata.apps.transactions.models import Category, Transaction
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()
D = Decimal
DATE = datetime.date


@pytest.fixture
def user():
    return User.objects.create_user(email="rep1@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="rep2@example.com", password="SecurePassword123!")


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
def monthly_book(user):
    return ensure_monthly_book(user, 2026, 10)[0]


@pytest.fixture
def event_book(user):
    return create_book(user, {"type": BookType.EVENT, "name": "Puja"})


@pytest.fixture
def general_book(user):
    return create_book(user, {"type": BookType.GENERAL, "name": "Misc"})


def _txn(user, book, amount, date, txn_type="EXPENSE", category=None):
    data = {
        "book_id": book.id,
        "type": txn_type,
        "amount": D(amount),
        "transaction_date": date,
    }
    if category is not None:
        data["category_id"] = category.id
    return create_transaction(user, data)


def _breakdown(report):
    return {row["book_type"]: row for row in report["book_type_breakdown"]}


def _monthly_budget(user, limit="20000.00", year=2026, month=10):
    return create_budget(
        user,
        {"scope": BudgetScope.MONTHLY_OVERALL, "year": year, "month": month, "total_limit": D(limit)},
    )


# ---------------------------------------------------------------------------
# month_bounds (shared helper; BE-006 behaviour preserved)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "year,month,first,next_first",
    [
        (2026, 10, DATE(2026, 10, 1), DATE(2026, 11, 1)),
        (2026, 12, DATE(2026, 12, 1), DATE(2027, 1, 1)),
        (2024, 2, DATE(2024, 2, 1), DATE(2024, 3, 1)),
        (2025, 2, DATE(2025, 2, 1), DATE(2025, 3, 1)),
    ],
)
def test_month_bounds(year, month, first, next_first):
    assert month_bounds(year, month) == (first, next_first)


# ---------------------------------------------------------------------------
# Combined monthly totals
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_empty_month_returns_zeroes_and_all_book_types(user):
    report = monthly_report(user, 2026, 10)
    assert report["period"] == {"year": 2026, "month": 10}
    assert report["currency"] == "INR"
    assert report["income_total"] == D("0.00")
    assert report["expense_total"] == D("0.00")
    assert report["net_cash_flow"] == D("0.00")
    assert [r["book_type"] for r in report["book_type_breakdown"]] == [
        "MONTHLY",
        "EVENT",
        "GENERAL",
    ]
    assert all(
        r["income"] == D("0.00") and r["expenses"] == D("0.00")
        for r in report["book_type_breakdown"]
    )
    assert report["category_breakdown"] == []
    assert report["recent_transactions"] == []


@pytest.mark.django_db
def test_combined_totals_across_all_three_book_types(
    user, monthly_book, event_book, general_book, salary
):
    _txn(user, monthly_book, "40000.00", DATE(2026, 10, 1), "INCOME", salary)
    _txn(user, monthly_book, "12000.00", DATE(2026, 10, 5))
    _txn(user, event_book, "5000.00", DATE(2026, 10, 7))
    _txn(user, general_book, "300.50", DATE(2026, 10, 9))
    _txn(user, general_book, "100.00", DATE(2026, 10, 9), "INCOME")

    report = monthly_report(user, 2026, 10)
    assert report["income_total"] == D("40100.00")
    assert report["expense_total"] == D("17300.50")
    assert report["net_cash_flow"] == D("22799.50")
    rows = _breakdown(report)
    assert rows["MONTHLY"]["income"] == D("40000.00")
    assert rows["MONTHLY"]["expenses"] == D("12000.00")
    assert rows["EVENT"]["income"] == D("0.00")
    assert rows["EVENT"]["expenses"] == D("5000.00")
    assert rows["GENERAL"]["income"] == D("100.00")
    assert rows["GENERAL"]["expenses"] == D("300.50")


@pytest.mark.django_db
def test_book_type_breakdown_reconciles_with_totals(
    user, monthly_book, event_book, general_book
):
    _txn(user, monthly_book, "1.10", DATE(2026, 10, 2))
    _txn(user, event_book, "2.20", DATE(2026, 10, 3))
    _txn(user, general_book, "3.30", DATE(2026, 10, 4))
    _txn(user, general_book, "4.40", DATE(2026, 10, 4), "INCOME")
    report = monthly_report(user, 2026, 10)
    rows = report["book_type_breakdown"]
    assert sum(r["expenses"] for r in rows) == report["expense_total"] == D("6.60")
    assert sum(r["income"] for r in rows) == report["income_total"] == D("4.40")
    assert sum(c["total"] for c in report["category_breakdown"]) == report["expense_total"]


@pytest.mark.django_db
def test_event_expense_in_correct_month_and_counted_once(user, event_book):
    _txn(user, event_book, "700.00", DATE(2026, 10, 20))
    _txn(user, event_book, "50.00", DATE(2026, 11, 2))

    october = monthly_report(user, 2026, 10)
    assert october["expense_total"] == D("700.00")
    assert _breakdown(october)["EVENT"]["expenses"] == D("700.00")
    assert sum(r["expenses"] for r in october["book_type_breakdown"]) == D("700.00")
    assert len(october["recent_transactions"]) == 1

    november = monthly_report(user, 2026, 11)
    assert november["expense_total"] == D("50.00")


@pytest.mark.django_db
def test_event_expense_counts_in_event_and_monthly_budget_but_once_in_report(
    user, event_book
):
    create_budget(
        user, {"scope": BudgetScope.EVENT, "book_id": event_book.id, "total_limit": D("1000.00")}
    )
    _monthly_budget(user, "2000.00")
    _txn(user, event_book, "500.00", DATE(2026, 10, 10))

    report = monthly_report(user, 2026, 10)
    assert report["expense_total"] == D("500.00")
    assert report["budget"]["spent"] == D("500.00")
    assert book_report(user, event_book.id)["budget"].total_limit == D("1000.00")


@pytest.mark.django_db
def test_soft_deleted_transactions_excluded_everywhere(user, monthly_book, food):
    kept = _txn(user, monthly_book, "100.00", DATE(2026, 10, 3), category=food)
    gone = _txn(user, monthly_book, "900.00", DATE(2026, 10, 4), category=food)
    gone_income = _txn(user, monthly_book, "5000.00", DATE(2026, 10, 4), "INCOME")
    soft_delete_transaction(user, gone.id)
    soft_delete_transaction(user, gone_income.id)
    _monthly_budget(user, "1000.00")

    report = monthly_report(user, 2026, 10)
    assert report["expense_total"] == D("100.00")
    assert report["income_total"] == D("0.00")
    assert report["category_breakdown"][0]["total"] == D("100.00")
    assert [t.id for t in report["recent_transactions"]] == [kept.id]
    assert report["budget"]["spent"] == D("100.00")
    assert book_report(user, monthly_book.id)["expense_total"] == D("100.00")


@pytest.mark.django_db
def test_only_income_and_expense_types_contribute(user, monthly_book):
    """Transfers are not modelled in V1; only INCOME and EXPENSE exist."""
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 3), "INCOME")
    _txn(user, monthly_book, "4.00", DATE(2026, 10, 3))
    report = monthly_report(user, 2026, 10)
    assert report["income_total"] == D("10.00")
    assert report["expense_total"] == D("4.00")
    assert report["net_cash_flow"] == D("6.00")


@pytest.mark.django_db
def test_transfer_type_cannot_exist_and_never_counts(user, monthly_book):
    with pytest.raises(IntegrityError), transaction.atomic():
        Transaction.objects.create(
            book=monthly_book,
            type="TRANSFER",
            amount=D("100.00"),
            transaction_date=DATE(2026, 10, 3),
        )
    report = monthly_report(user, 2026, 10)
    assert report["income_total"] == D("0.00")
    assert report["expense_total"] == D("0.00")


@pytest.mark.django_db
def test_net_cash_flow_can_be_negative(user, monthly_book):
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 3), "INCOME")
    _txn(user, monthly_book, "25.00", DATE(2026, 10, 3))
    assert monthly_report(user, 2026, 10)["net_cash_flow"] == D("-15.00")


@pytest.mark.django_db
def test_archived_book_transactions_remain_in_history(user, event_book):
    _txn(user, event_book, "321.00", DATE(2026, 10, 12))
    archive_book(event_book)
    report = monthly_report(user, 2026, 10)
    assert report["expense_total"] == D("321.00")
    assert _breakdown(report)["EVENT"]["expenses"] == D("321.00")
    assert book_report(user, event_book.id)["expense_total"] == D("321.00")


@pytest.mark.django_db
def test_december_january_boundary(user):
    dec_book = ensure_monthly_book(user, 2026, 12)[0]
    jan_book = ensure_monthly_book(user, 2027, 1)[0]
    _txn(user, dec_book, "10.00", DATE(2026, 12, 31))
    _txn(user, jan_book, "20.00", DATE(2027, 1, 1))
    assert monthly_report(user, 2026, 12)["expense_total"] == D("10.00")
    assert monthly_report(user, 2027, 1)["expense_total"] == D("20.00")


@pytest.mark.django_db
def test_february_leap_year_boundary(user, general_book):
    _txn(user, general_book, "1.00", DATE(2024, 2, 29))
    _txn(user, general_book, "2.00", DATE(2024, 3, 1))
    _txn(user, general_book, "4.00", DATE(2024, 1, 31))
    _txn(user, general_book, "8.00", DATE(2025, 2, 28))
    assert monthly_report(user, 2024, 2)["expense_total"] == D("1.00")
    assert monthly_report(user, 2024, 3)["expense_total"] == D("2.00")
    assert monthly_report(user, 2025, 2)["expense_total"] == D("8.00")


@pytest.mark.django_db
def test_month_start_and_end_dates_inclusive(user, general_book):
    _txn(user, general_book, "1.00", DATE(2026, 10, 1))
    _txn(user, general_book, "2.00", DATE(2026, 10, 31))
    _txn(user, general_book, "4.00", DATE(2026, 9, 30))
    _txn(user, general_book, "8.00", DATE(2026, 11, 1))
    assert monthly_report(user, 2026, 10)["expense_total"] == D("3.00")


# ---------------------------------------------------------------------------
# Category breakdown
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_category_breakdown_excludes_income_and_orders_desc(
    user, monthly_book, food, travel, salary
):
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 3), category=food)
    _txn(user, monthly_book, "50.00", DATE(2026, 10, 4), category=food)
    _txn(user, monthly_book, "400.00", DATE(2026, 10, 5), category=travel)
    _txn(user, monthly_book, "9999.00", DATE(2026, 10, 6), "INCOME", salary)

    rows = monthly_report(user, 2026, 10)["category_breakdown"]
    assert [(r["category_name"], r["total"]) for r in rows] == [
        ("Travel", D("400.00")),
        ("Food", D("150.00")),
    ]
    assert rows[0]["category_id"] == travel.id


@pytest.mark.django_db
def test_uncategorised_expenses_grouped_into_single_row(user, monthly_book, general_book, food):
    _txn(user, monthly_book, "30.00", DATE(2026, 10, 3))
    _txn(user, general_book, "70.00", DATE(2026, 10, 4))
    _txn(user, monthly_book, "20.00", DATE(2026, 10, 5), category=food)

    rows = monthly_report(user, 2026, 10)["category_breakdown"]
    assert rows[0] == {"category_id": None, "category_name": "Uncategorised", "total": D("100.00")}
    assert rows[1]["category_name"] == "Food"
    assert len(rows) == 2


@pytest.mark.django_db
def test_category_breakdown_tie_is_deterministic(user, monthly_book, food, travel):
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 3), category=travel)
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 3), category=food)
    names = [r["category_name"] for r in monthly_report(user, 2026, 10)["category_breakdown"]]
    assert names == ["Food", "Travel"]


# ---------------------------------------------------------------------------
# Budget block
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_missing_budget_is_not_set(user):
    assert monthly_report(user, 2026, 10)["budget"] == {
        "total_limit": None,
        "spent": None,
        "remaining": None,
        "utilization_percent": None,
        "status": "NOT_SET",
    }
    assert budget_summary(None)["status"] == "NOT_SET"


@pytest.mark.django_db
def test_budget_block_matches_contract_example(user, monthly_book, event_book):
    _monthly_budget(user, "20000.00")
    _txn(user, monthly_book, "12000.00", DATE(2026, 10, 5))
    _txn(user, event_book, "5000.00", DATE(2026, 10, 7))
    budget = monthly_report(user, 2026, 10)["budget"]
    assert budget == {
        "total_limit": D("20000.00"),
        "spent": D("17000.00"),
        "remaining": D("3000.00"),
        "utilization_percent": D("85.00"),
        "status": "NEAR_LIMIT",
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    "limit,spent,status,remaining,percent",
    [
        ("1000.00", "100.00", "ON_TRACK", D("900.00"), D("10.00")),
        ("1000.00", "800.00", "NEAR_LIMIT", D("200.00"), D("80.00")),
        ("1000.00", "1000.00", "NEAR_LIMIT", D("0.00"), D("100.00")),
        ("1000.00", "1250.00", "OVER_BUDGET", D("-250.00"), D("125.00")),
        ("0.00", "10.00", "UNBUDGETED_SPENDING", D("-10.00"), None),
        ("0.00", None, "ON_TRACK", D("0.00"), D("0.00")),
    ],
)
def test_budget_block_statuses(user, general_book, limit, spent, status, remaining, percent):
    _monthly_budget(user, limit)
    if spent is not None:
        _txn(user, general_book, spent, DATE(2026, 10, 5))
    budget = monthly_report(user, 2026, 10)["budget"]
    assert budget["status"] == status
    assert budget["remaining"] == remaining
    assert budget["utilization_percent"] == percent
    assert budget["total_limit"] == D(limit)


@pytest.mark.django_db
def test_budget_ignores_income(user, general_book):
    _monthly_budget(user, "100.00")
    _txn(user, general_book, "5000.00", DATE(2026, 10, 5), "INCOME")
    assert monthly_report(user, 2026, 10)["budget"]["spent"] == D("0.00")


# ---------------------------------------------------------------------------
# Recent transactions
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_recent_transactions_limited_to_five_in_deterministic_order(user, general_book):
    for day in range(1, 9):
        _txn(user, general_book, "1.00", DATE(2026, 10, day))
    # Two on the same date: later created first.
    first = _txn(user, general_book, "2.00", DATE(2026, 10, 20))
    second = _txn(user, general_book, "3.00", DATE(2026, 10, 20))
    _txn(user, general_book, "9.00", DATE(2026, 11, 1))  # other month: excluded

    recent = monthly_report(user, 2026, 10)["recent_transactions"]
    assert len(recent) == 5
    assert recent[0].id == second.id
    assert recent[1].id == first.id
    assert [t.transaction_date for t in recent[2:]] == [DATE(2026, 10, 8), DATE(2026, 10, 7), DATE(2026, 10, 6)]


@pytest.mark.django_db
def test_recent_transactions_fewer_than_five(user, general_book):
    _txn(user, general_book, "1.00", DATE(2026, 10, 1))
    _txn(user, general_book, "1.00", DATE(2026, 10, 2))
    assert len(monthly_report(user, 2026, 10)["recent_transactions"]) == 2


# ---------------------------------------------------------------------------
# Book report
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_book_report_totals_and_closing_balance(user, general_book, food, salary):
    Book.objects.filter(pk=general_book.pk).update(opening_balance=D("1000.00"))
    _txn(user, general_book, "300.00", DATE(2026, 9, 1), "INCOME", salary)
    _txn(user, general_book, "120.00", DATE(2026, 10, 1), category=food)
    _txn(user, general_book, "30.00", DATE(2026, 11, 1))

    report = book_report(user, general_book.id)
    assert report["book"].id == general_book.id
    assert report["income_total"] == D("300.00")
    assert report["expense_total"] == D("150.00")
    assert report["net_cash_flow"] == D("150.00")
    assert report["closing_balance"] == D("1150.00")  # opening + income - expense
    assert [(r["category_name"], r["total"]) for r in report["category_breakdown"]] == [
        ("Food", D("120.00")),
        ("Uncategorised", D("30.00")),
    ]
    assert report["budget"] is None


@pytest.mark.django_db
def test_book_report_empty_book(user, general_book):
    report = book_report(user, general_book.id)
    assert report["income_total"] == D("0.00")
    assert report["closing_balance"] == D("0.00")
    assert report["category_breakdown"] == []


@pytest.mark.django_db
def test_book_report_only_includes_that_books_transactions(user, event_book, general_book):
    _txn(user, event_book, "10.00", DATE(2026, 10, 1))
    _txn(user, general_book, "99.00", DATE(2026, 10, 1))
    assert book_report(user, event_book.id)["expense_total"] == D("10.00")


@pytest.mark.django_db
def test_event_budget_only_for_event_books(user, event_book, general_book, monthly_book):
    create_budget(
        user, {"scope": BudgetScope.EVENT, "book_id": event_book.id, "total_limit": D("500.00")}
    )
    _monthly_budget(user)
    assert book_report(user, event_book.id)["budget"].total_limit == D("500.00")
    assert book_report(user, general_book.id)["budget"] is None
    assert book_report(user, monthly_book.id)["budget"] is None


@pytest.mark.django_db
def test_event_book_without_budget_returns_none(user, event_book):
    assert book_report(user, event_book.id)["budget"] is None


# ---------------------------------------------------------------------------
# Budget utilization
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_budget_utilization_report(user):
    assert budget_utilization_report(user, 2026, 10) == {
        "period": {"year": 2026, "month": 10},
        "budget": None,
    }
    budget = _monthly_budget(user)
    assert budget_utilization_report(user, 2026, 10)["budget"].id == budget.id
    assert budget_utilization_report(user, 2026, 11)["budget"] is None


# ---------------------------------------------------------------------------
# Cross-user isolation
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_cross_user_isolation(user, other_user, monthly_book):
    other_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    other_monthly = ensure_monthly_book(other_user, 2026, 10)[0]
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 3))
    _txn(other_user, other_book, "5000.00", DATE(2026, 10, 3))
    _txn(other_user, other_monthly, "7000.00", DATE(2026, 10, 3), "INCOME")
    _monthly_budget(other_user, "1.00")

    report = monthly_report(user, 2026, 10)
    assert report["expense_total"] == D("10.00")
    assert report["income_total"] == D("0.00")
    assert len(report["recent_transactions"]) == 1
    assert report["budget"]["status"] == "NOT_SET"
    assert budget_utilization_report(user, 2026, 10)["budget"] is None
    with pytest.raises(Book.DoesNotExist):
        book_report(user, other_book.id)
