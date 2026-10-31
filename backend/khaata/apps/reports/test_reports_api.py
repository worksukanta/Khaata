"""
API integration tests for reports (BE-007):
GET /api/v1/reports/monthly/, GET /api/v1/reports/books/{id}/,
GET /api/v1/reports/budget-utilization/.
"""
import datetime
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import archive_book, create_book, ensure_monthly_book
from khaata.apps.budgets.models import BudgetScope
from khaata.apps.budgets.services import create_budget, replace_allocations
from khaata.apps.transactions.models import Category
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()
D = Decimal
DATE = datetime.date

MONTHLY = "report-monthly"
BOOK = "report-book"
UTIL = "report-budget-utilization"


@pytest.fixture
def user():
    return User.objects.create_user(email="rapi1@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="rapi2@example.com", password="SecurePassword123!")


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


@pytest.fixture
def food(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


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


def _txn(user, book, amount, date, txn_type="EXPENSE", category=None, description=None):
    data = {
        "book_id": book.id,
        "type": txn_type,
        "amount": D(amount),
        "transaction_date": date,
    }
    if category is not None:
        data["category_id"] = category.id
    if description is not None:
        data["description"] = description
    return create_transaction(user, data)


def _monthly_budget(user, limit="20000.00", year=2026, month=10):
    return create_budget(
        user,
        {"scope": BudgetScope.MONTHLY_OVERALL, "year": year, "month": month, "total_limit": D(limit)},
    )


def _get_monthly(client, year=2026, month=10):
    return client.get(reverse(MONTHLY), {"year": year, "month": month})


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_unauthenticated_requests_rejected(client):
    assert client.get(reverse(MONTHLY), {"year": 2026, "month": 10}).status_code == 401
    assert client.get(reverse(BOOK, args=[uuid.uuid4()])).status_code == 401
    assert client.get(reverse(UTIL), {"year": 2026, "month": 10}).status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("name", [MONTHLY, UTIL])
def test_report_endpoints_are_get_only(auth_client, name):
    resp = auth_client.post(reverse(name), {})
    assert resp.status_code in (403, 405)
    resp = Client(enforce_csrf_checks=True).post(reverse(name), {})
    assert resp.status_code in (401, 403, 405)


# ---------------------------------------------------------------------------
# Monthly dashboard
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_monthly_happy_path_shape_and_decimal_strings(
    auth_client, user, monthly_book, event_book, general_book, food, salary
):
    _monthly_budget(user, "20000.00")
    _txn(user, monthly_book, "40000.00", DATE(2026, 10, 1), "INCOME", salary)
    _txn(user, monthly_book, "12000.00", DATE(2026, 10, 5), category=food)
    _txn(user, event_book, "5000.00", DATE(2026, 10, 7))

    resp = _get_monthly(auth_client)
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("application/json")
    body = resp.json()
    assert set(body) == {
        "period",
        "currency",
        "income_total",
        "expense_total",
        "net_cash_flow",
        "book_type_breakdown",
        "category_breakdown",
        "budget",
        "recent_transactions",
    }
    assert body["period"] == {"year": 2026, "month": 10}
    assert body["currency"] == "INR"
    assert body["income_total"] == "40000.00"
    assert body["expense_total"] == "17000.00"
    assert body["net_cash_flow"] == "23000.00"
    assert body["book_type_breakdown"] == [
        {"book_type": "MONTHLY", "income": "40000.00", "expenses": "12000.00"},
        {"book_type": "EVENT", "income": "0.00", "expenses": "5000.00"},
        {"book_type": "GENERAL", "income": "0.00", "expenses": "0.00"},
    ]
    assert body["category_breakdown"] == [
        {"category_id": str(food.id), "category_name": "Food", "total": "12000.00"},
        {"category_id": None, "category_name": "Uncategorised", "total": "5000.00"},
    ]
    assert body["budget"] == {
        "total_limit": "20000.00",
        "spent": "17000.00",
        "remaining": "3000.00",
        "utilization_percent": "85.00",
        "status": "NEAR_LIMIT",
    }
    assert len(body["recent_transactions"]) == 3
    recent = body["recent_transactions"][0]
    assert recent["amount"] == "5000.00"
    assert recent["book_id"] == str(event_book.id)
    assert recent["category"] is None


@pytest.mark.django_db
def test_monthly_overspent_budget_has_negative_remaining_string(auth_client, user, general_book):
    _monthly_budget(user, "100.00")
    _txn(user, general_book, "150.00", DATE(2026, 10, 2))
    budget = _get_monthly(auth_client).json()["budget"]
    assert budget["remaining"] == "-50.00"
    assert budget["utilization_percent"] == "150.00"
    assert budget["status"] == "OVER_BUDGET"


@pytest.mark.django_db
def test_monthly_unbudgeted_spending_has_null_percent(auth_client, user, general_book):
    _monthly_budget(user, "0.00")
    _txn(user, general_book, "10.00", DATE(2026, 10, 2))
    budget = _get_monthly(auth_client).json()["budget"]
    assert budget["status"] == "UNBUDGETED_SPENDING"
    assert budget["utilization_percent"] is None
    assert budget["remaining"] == "-10.00"


@pytest.mark.django_db
def test_monthly_empty_month_returns_valid_zero_response(auth_client):
    resp = _get_monthly(auth_client, 2026, 2)
    assert resp.status_code == 200
    body = resp.json()
    assert body["income_total"] == body["expense_total"] == body["net_cash_flow"] == "0.00"
    assert [r["book_type"] for r in body["book_type_breakdown"]] == [
        "MONTHLY",
        "EVENT",
        "GENERAL",
    ]
    assert all(r["income"] == r["expenses"] == "0.00" for r in body["book_type_breakdown"])
    assert body["category_breakdown"] == []
    assert body["recent_transactions"] == []
    assert body["budget"] == {
        "total_limit": None,
        "spent": None,
        "remaining": None,
        "utilization_percent": None,
        "status": "NOT_SET",
    }


@pytest.mark.django_db
def test_monthly_does_not_create_books_or_write(auth_client, user):
    before = Book.objects.count()
    assert _get_monthly(auth_client, 2031, 5).status_code == 200
    assert Book.objects.count() == before


@pytest.mark.django_db
@pytest.mark.parametrize(
    "params,field",
    [
        ({}, "year"),
        ({"year": 2026}, "month"),
        ({"month": 10}, "year"),
        ({"year": "abc", "month": 10}, "year"),
        ({"year": 2026, "month": "x"}, "month"),
        ({"year": 1999, "month": 10}, "year"),
        ({"year": 2201, "month": 10}, "year"),
        ({"year": 2026, "month": 0}, "month"),
        ({"year": 2026, "month": 13}, "month"),
        ({"year": "99999999999999999999", "month": 10}, "year"),
        ({"year": 2026.5, "month": 10}, "year"),
    ],
)
@pytest.mark.parametrize("name", [MONTHLY, UTIL])
def test_invalid_period_returns_400(auth_client, name, params, field):
    resp = auth_client.get(reverse(name), params)
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "validation_error"
    assert field in body["error"]["details"]


@pytest.mark.django_db
@pytest.mark.parametrize("year", [2000, 2200])
def test_year_boundaries_accepted(auth_client, year):
    assert _get_monthly(auth_client, year, 12).status_code == 200


@pytest.mark.django_db
def test_recent_transactions_never_exceed_five_and_are_ordered(auth_client, user, general_book):
    ids = []
    for day in range(1, 8):
        ids.append(str(_txn(user, general_book, "1.00", DATE(2026, 10, day)).id))
    latest_a = _txn(user, general_book, "2.00", DATE(2026, 10, 20))
    latest_b = _txn(user, general_book, "3.00", DATE(2026, 10, 20))

    recent = _get_monthly(auth_client).json()["recent_transactions"]
    assert len(recent) == 5
    assert [t["id"] for t in recent] == [
        str(latest_b.id),
        str(latest_a.id),
        ids[6],
        ids[5],
        ids[4],
    ]
    # Repeat call: identical order (deterministic).
    assert _get_monthly(auth_client).json()["recent_transactions"] == recent


@pytest.mark.django_db
def test_recent_transactions_use_transaction_serializer_fields(auth_client, user, monthly_book, food):
    _txn(user, monthly_book, "9.99", DATE(2026, 10, 3), category=food, description="Lunch")
    item = _get_monthly(auth_client).json()["recent_transactions"][0]
    assert set(item) == {
        "id",
        "book_id",
        "type",
        "amount",
        "transaction_date",
        "category",
        "payment_method",
        "description",
        "created_at",
        "updated_at",
    }
    assert item["category"] == {"id": str(food.id), "name": "Food", "type": "EXPENSE"}
    assert item["description"] == "Lunch"


@pytest.mark.django_db
def test_monthly_excludes_soft_deleted_and_includes_archived(auth_client, user, event_book, general_book):
    kept = _txn(user, event_book, "10.00", DATE(2026, 10, 3))
    dead = _txn(user, general_book, "999.00", DATE(2026, 10, 3))
    soft_delete_transaction(user, dead.id)
    archive_book(event_book)
    body = _get_monthly(auth_client).json()
    assert body["expense_total"] == "10.00"
    assert [t["id"] for t in body["recent_transactions"]] == [str(kept.id)]


@pytest.mark.django_db
def test_monthly_query_count_is_constant(auth_client, user, monthly_book, event_book, food):
    _monthly_budget(user)
    _txn(user, monthly_book, "1.00", DATE(2026, 10, 1), category=food)
    with CaptureQueriesContext(connection) as small:
        _get_monthly(auth_client)
    for day in range(2, 12):
        _txn(user, event_book if day % 2 else monthly_book, "1.00", DATE(2026, 10, day), category=food)
    with CaptureQueriesContext(connection) as large:
        _get_monthly(auth_client)
    assert len(large) == len(small)
    assert len(large) <= 12


# ---------------------------------------------------------------------------
# Book report
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_book_report_owned_book_returns_200(auth_client, user, general_book, food, salary):
    Book.objects.filter(pk=general_book.pk).update(opening_balance=D("100.00"))
    _txn(user, general_book, "50.00", DATE(2026, 10, 3), "INCOME", salary)
    _txn(user, general_book, "20.00", DATE(2026, 10, 4), category=food)
    _txn(user, general_book, "5.00", DATE(2026, 11, 4))

    resp = auth_client.get(reverse(BOOK, args=[general_book.id]))
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("application/json")
    body = resp.json()
    assert set(body) == {
        "book",
        "income_total",
        "expense_total",
        "net_cash_flow",
        "closing_balance",
        "category_breakdown",
        "budget",
    }
    assert body["book"] == {
        "id": str(general_book.id),
        "type": "GENERAL",
        "name": "Misc",
        "is_archived": False,
    }
    assert body["income_total"] == "50.00"
    assert body["expense_total"] == "25.00"
    assert body["net_cash_flow"] == "25.00"
    assert body["closing_balance"] == "125.00"
    assert body["category_breakdown"] == [
        {"category_id": str(food.id), "category_name": "Food", "total": "20.00"},
        {"category_id": None, "category_name": "Uncategorised", "total": "5.00"},
    ]
    assert body["budget"] is None


@pytest.mark.django_db
def test_book_report_event_book_includes_event_budget(auth_client, user, event_book):
    create_budget(
        user, {"scope": BudgetScope.EVENT, "book_id": event_book.id, "total_limit": D("1000.00")}
    )
    _txn(user, event_book, "250.00", DATE(2026, 10, 3))
    body = auth_client.get(reverse(BOOK, args=[event_book.id])).json()
    budget = body["budget"]
    assert budget["scope"] == "EVENT"
    assert budget["book_id"] == str(event_book.id)
    assert budget["total_limit"] == "1000.00"
    assert budget["spent"] == "250.00"
    assert budget["remaining"] == "750.00"
    assert budget["utilization_percent"] == "25.00"
    assert budget["status"] == "ON_TRACK"
    assert "allocations" in budget


@pytest.mark.django_db
def test_book_report_event_budget_with_allocations(auth_client, user, event_book, food):
    budget = create_budget(
        user, {"scope": BudgetScope.EVENT, "book_id": event_book.id, "total_limit": D("1000.00")}
    )
    replace_allocations(user, budget.id, [{"category_id": food.id, "amount": D("400.00")}])
    _txn(user, event_book, "100.00", DATE(2026, 10, 3), category=food)
    allocations = auth_client.get(reverse(BOOK, args=[event_book.id])).json()["budget"]["allocations"]
    assert allocations[0]["category"]["name"] == "Food"
    assert allocations[0]["spent"] == "100.00"


@pytest.mark.django_db
def test_book_report_event_budget_null_when_absent_or_other_types(
    auth_client, user, event_book, general_book, monthly_book
):
    _monthly_budget(user)
    for book in (event_book, general_book, monthly_book):
        assert auth_client.get(reverse(BOOK, args=[book.id])).json()["budget"] is None


@pytest.mark.django_db
def test_book_report_archived_book_is_reportable(auth_client, user, event_book):
    _txn(user, event_book, "42.00", DATE(2026, 10, 3))
    archive_book(event_book)
    resp = auth_client.get(reverse(BOOK, args=[event_book.id]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["book"]["is_archived"] is True
    assert body["expense_total"] == "42.00"


@pytest.mark.django_db
def test_book_report_excludes_soft_deleted(auth_client, user, general_book):
    _txn(user, general_book, "10.00", DATE(2026, 10, 3))
    dead = _txn(user, general_book, "500.00", DATE(2026, 10, 3))
    soft_delete_transaction(user, dead.id)
    assert auth_client.get(reverse(BOOK, args=[general_book.id])).json()["expense_total"] == "10.00"


@pytest.mark.django_db
def test_book_report_cross_user_and_unknown_are_identical_404(auth_client, other_user):
    theirs = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    foreign = auth_client.get(reverse(BOOK, args=[theirs.id]))
    unknown = auth_client.get(reverse(BOOK, args=[uuid.uuid4()]))
    assert foreign.status_code == unknown.status_code == 404
    assert foreign.json() == unknown.json()
    assert foreign.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_book_report_malformed_id_is_404(auth_client):
    assert auth_client.get("/api/v1/reports/books/not-a-uuid/").status_code == 404


# ---------------------------------------------------------------------------
# Budget utilization
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_budget_utilization_with_budget(auth_client, user, general_book, food):
    budget = _monthly_budget(user, "1000.00")
    replace_allocations(user, budget.id, [{"category_id": food.id, "amount": D("600.00")}])
    _txn(user, general_book, "900.00", DATE(2026, 10, 3), category=food)

    resp = auth_client.get(reverse(UTIL), {"year": 2026, "month": 10})
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("application/json")
    body = resp.json()
    assert set(body) == {"period", "budget"}
    assert body["period"] == {"year": 2026, "month": 10}
    assert body["budget"]["id"] == str(budget.id)
    assert body["budget"]["scope"] == "MONTHLY_OVERALL"
    assert body["budget"]["total_limit"] == "1000.00"
    assert body["budget"]["spent"] == "900.00"
    assert body["budget"]["remaining"] == "100.00"
    assert body["budget"]["utilization_percent"] == "90.00"
    assert body["budget"]["status"] == "NEAR_LIMIT"
    alloc = body["budget"]["allocations"][0]
    assert alloc["amount"] == "600.00"
    assert alloc["spent"] == "900.00"
    assert alloc["status"] == "OVER_BUDGET"
    assert alloc["remaining"] == "-300.00"


@pytest.mark.django_db
def test_budget_utilization_matches_budget_detail_endpoint(auth_client, user, general_book):
    budget = _monthly_budget(user, "500.00")
    _txn(user, general_book, "100.00", DATE(2026, 10, 3))
    report = auth_client.get(reverse(UTIL), {"year": 2026, "month": 10}).json()["budget"]
    detail = auth_client.get(reverse("budget-detail", args=[budget.id])).json()
    assert report == detail


@pytest.mark.django_db
def test_budget_utilization_without_budget_uses_requested_period(auth_client, user):
    _monthly_budget(user, year=2026, month=10)
    resp = auth_client.get(reverse(UTIL), {"year": 2027, "month": 3})
    assert resp.status_code == 200
    assert resp.json() == {"period": {"year": 2027, "month": 3}, "budget": None}


# ---------------------------------------------------------------------------
# Cross-user isolation
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_cross_user_data_never_appears(auth_client, user, other_user, general_book, food):
    theirs_general = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    theirs_event = create_book(other_user, {"type": BookType.EVENT, "name": "TheirEvent"})
    their_cat = Category.objects.create(owner=other_user, name="Secret", type="EXPENSE")
    _txn(user, general_book, "10.00", DATE(2026, 10, 3), category=food)
    _txn(other_user, theirs_general, "8888.00", DATE(2026, 10, 3), category=their_cat)
    _txn(other_user, theirs_event, "7777.00", DATE(2026, 10, 3), "INCOME")
    _monthly_budget(other_user, "1.00")
    create_budget(
        other_user,
        {"scope": BudgetScope.EVENT, "book_id": theirs_event.id, "total_limit": D("5.00")},
    )

    body = _get_monthly(auth_client).json()
    assert body["expense_total"] == "10.00"
    assert body["income_total"] == "0.00"
    assert [c["category_name"] for c in body["category_breakdown"]] == ["Food"]
    assert len(body["recent_transactions"]) == 1
    assert body["budget"]["status"] == "NOT_SET"
    assert "Secret" not in _get_monthly(auth_client).content.decode()

    util = auth_client.get(reverse(UTIL), {"year": 2026, "month": 10}).json()
    assert util["budget"] is None
    assert auth_client.get(reverse(BOOK, args=[theirs_event.id])).status_code == 404

    # The other user sees only their own figures.
    other = Client()
    other.force_login(other_user)
    other_body = _get_monthly(other).json()
    assert other_body["expense_total"] == "8888.00"
    assert other_body["income_total"] == "7777.00"
