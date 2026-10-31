"""
BE-009 Integration tests — cross-module correctness and security hardening.

Covers workflows that span multiple backend apps and financial invariants
that are not already exercised by individual app tests:

1. Full registration flow: user created → default categories/payment methods seeded.
2. Event expense counted in BOTH event budget AND monthly overall budget.
3. Income excluded from all budget spending calculations.
4. Soft-delete removes transactions from: list, detail, reports, budget spending, CSV.
5. Date-based book reassignment and its effect on the monthly report totals.
6. Archived-book transactions remain in reports and budget spending.
7. Opening balance not counted as income; closing_balance formula.
8. Budget overspending never blocks a transaction write.
9. Monthly report counts each transaction exactly once regardless of book type.
10. Budget utilization report matches direct GET /budgets/{id}/.
11. Cross-user data never leaks across all endpoints.
12. Error response envelope shape is consistent across all modules.
"""
import csv
import datetime
import io
import json
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from khaata.apps.books.models import BookType
from khaata.apps.books.services import archive_book, create_book, ensure_monthly_book
from khaata.apps.budgets.models import BudgetScope
from khaata.apps.budgets.services import create_budget, replace_allocations
from khaata.apps.transactions.models import Category, PaymentMethod
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()
D = Decimal
DATE = datetime.date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _post(client, url, payload, **extra):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **extra)


def _patch(client, url, payload, **extra):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **extra)


def _txn(user, book, amount, date, txn_type="EXPENSE", category=None, payment_method=None, description=None):
    data = {
        "book_id": book.id,
        "type": txn_type,
        "amount": D(amount),
        "transaction_date": date,
    }
    if category is not None:
        data["category_id"] = category.id
    if payment_method is not None:
        data["payment_method_id"] = payment_method.id
    if description is not None:
        data["description"] = description
    return create_transaction(user, data)


def _monthly_budget(user, limit="20000.00", year=2026, month=10):
    return create_budget(
        user,
        {"scope": BudgetScope.MONTHLY_OVERALL, "year": year, "month": month, "total_limit": D(limit)},
    )


def _event_budget(user, book, limit="5000.00"):
    return create_budget(
        user,
        {"scope": BudgetScope.EVENT, "book_id": book.id, "total_limit": D(limit)},
    )


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def user(db):
    return User.objects.create_user(email="intg1@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="intg2@example.com", password="SecurePassword123!")


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


@pytest.fixture
def monthly_book(user):
    return ensure_monthly_book(user, 2026, 10)[0]


@pytest.fixture
def event_book(user):
    return create_book(user, {"type": BookType.EVENT, "name": "Puja 2026"})


@pytest.fixture
def general_book(user):
    return create_book(user, {"type": BookType.GENERAL, "name": "Misc"})


@pytest.fixture
def food(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


@pytest.fixture
def salary_cat(user):
    return Category.objects.create(owner=user, name="Salary", type="INCOME")


@pytest.fixture
def cash(user):
    return PaymentMethod.objects.create(owner=user, name="Cash")


# ---------------------------------------------------------------------------
# 1. Registration seeds default categories and payment methods
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_registration_seeds_default_categories_and_payment_methods():
    """POST /auth/register/ must seed default categories and payment methods."""
    c = Client()
    resp = _post(c, reverse("auth-register"), {
        "email": "fresh@example.com",
        "password": "SecurePassword123!",
    })
    assert resp.status_code == 201
    new_user = User.objects.get(email="fresh@example.com")

    # Expense and income categories seeded
    expense_cats = list(Category.objects.filter(owner=new_user, type="EXPENSE").values_list("name", flat=True))
    income_cats = list(Category.objects.filter(owner=new_user, type="INCOME").values_list("name", flat=True))
    assert len(expense_cats) >= 5, f"Expected default expense categories, got: {expense_cats}"
    assert len(income_cats) >= 3, f"Expected default income categories, got: {income_cats}"
    assert "Other" in expense_cats
    assert "Other" in income_cats

    # Default payment methods seeded
    methods = list(PaymentMethod.objects.filter(owner=new_user).values_list("name", flat=True))
    for name in ("Cash", "UPI", "Bank Transfer", "Debit Card", "Credit Card", "Other"):
        assert name in methods, f"Missing default payment method: {name}"


# ---------------------------------------------------------------------------
# 2. Event expense counted in both event budget AND monthly overall budget
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_event_expense_counted_in_both_event_and_monthly_budget(
    user, event_book, monthly_book, food
):
    """
    A single expense in an event book must count against:
    - the event budget (budget scope = EVENT)
    - the monthly overall budget (budget scope = MONTHLY_OVERALL) for that date
    Both read the same underlying transaction exactly once each.
    """
    event_bud = _event_budget(user, event_book, "5000.00")
    monthly_bud = _monthly_budget(user, "20000.00")

    _txn(user, event_book, "1500.00", DATE(2026, 10, 5), category=food)

    # Event budget reflects the 1500 expense.
    c = Client()
    c.force_login(user)
    ev_detail = c.get(reverse("budget-detail", args=[event_bud.id])).json()
    assert ev_detail["spent"] == "1500.00"
    assert ev_detail["remaining"] == "3500.00"

    # Monthly overall budget also reflects the same 1500 expense.
    mo_detail = c.get(reverse("budget-detail", args=[monthly_bud.id])).json()
    assert mo_detail["spent"] == "1500.00"
    assert mo_detail["remaining"] == "18500.00"

    # Monthly report expense_total also counts the event-book expense.
    report = c.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert report["expense_total"] == "1500.00"
    event_breakdown = next(r for r in report["book_type_breakdown"] if r["book_type"] == "EVENT")
    monthly_breakdown = next(r for r in report["book_type_breakdown"] if r["book_type"] == "MONTHLY")
    assert event_breakdown["expenses"] == "1500.00"
    assert monthly_breakdown["expenses"] == "0.00"


# ---------------------------------------------------------------------------
# 3. Income excluded from budget spending
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_income_transactions_excluded_from_budget_spending(user, monthly_book, salary_cat):
    """
    INCOME transactions must never consume budget spending. Only EXPENSE
    transactions count against a MONTHLY_OVERALL budget.
    """
    budget = _monthly_budget(user, "10000.00")
    _txn(user, monthly_book, "50000.00", DATE(2026, 10, 1), txn_type="INCOME", category=salary_cat)

    c = Client()
    c.force_login(user)
    detail = c.get(reverse("budget-detail", args=[budget.id])).json()
    assert detail["spent"] == "0.00"
    assert detail["remaining"] == "10000.00"
    assert detail["status"] == "ON_TRACK"

    # Monthly report shows income but budget is unaffected.
    report = c.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert report["income_total"] == "50000.00"
    assert report["expense_total"] == "0.00"
    assert report["budget"]["spent"] == "0.00"


# ---------------------------------------------------------------------------
# 4. Soft-delete removes transactions from all aggregations simultaneously
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_soft_delete_removes_from_all_aggregations(user, monthly_book, event_book, food, auth_client):
    """
    Soft-deleting a transaction must remove it from:
    - GET /transactions/ list
    - GET /transactions/{id}/ detail (returns 404)
    - GET /reports/monthly/ totals, category_breakdown, recent_transactions
    - Budget spending calculation (GET /budgets/{id}/)
    - GET /exports/transactions.csv
    """
    event_bud = _event_budget(user, event_book, "5000.00")
    monthly_bud = _monthly_budget(user, "20000.00")

    kept = _txn(user, monthly_book, "100.00", DATE(2026, 10, 3), category=food)
    dead = _txn(user, event_book, "900.00", DATE(2026, 10, 4))

    # Before deletion: both appear everywhere.
    report_before = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert report_before["expense_total"] == "1000.00"
    assert auth_client.get(reverse("budget-detail", args=[monthly_bud.id])).json()["spent"] == "1000.00"
    assert auth_client.get(reverse("budget-detail", args=[event_bud.id])).json()["spent"] == "900.00"

    # Soft-delete.
    soft_delete_transaction(user, dead.id)

    # Transaction list excludes it.
    list_resp = auth_client.get(reverse("transaction-list-create")).json()
    assert list_resp["count"] == 1
    assert list_resp["results"][0]["id"] == str(kept.id)

    # Detail returns 404.
    assert auth_client.get(reverse("transaction-detail", args=[dead.id])).status_code == 404

    # Monthly report reflects only kept.
    report_after = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert report_after["expense_total"] == "100.00"
    assert len(report_after["recent_transactions"]) == 1
    assert report_after["recent_transactions"][0]["id"] == str(kept.id)

    # Budget spending reduced.
    assert auth_client.get(reverse("budget-detail", args=[monthly_bud.id])).json()["spent"] == "100.00"
    assert auth_client.get(reverse("budget-detail", args=[event_bud.id])).json()["spent"] == "0.00"

    # CSV excludes soft-deleted.
    csv_resp = auth_client.get("/api/v1/exports/transactions.csv")
    assert csv_resp.status_code == 200
    rows = _parse_csv(csv_resp.content)
    assert len(rows) == 1
    assert rows[0]["id"] == str(kept.id)


# ---------------------------------------------------------------------------
# 5. Date-based book reassignment and monthly report
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_date_reassignment_in_monthly_book_updates_report(user, monthly_book, auth_client):
    """
    Moving a transaction in a MONTHLY book to a different month must atomically
    reassign it and the monthly reports for each month must reflect the change.
    """
    txn = _txn(user, monthly_book, "500.00", DATE(2026, 10, 3))

    # Oct 2026 report shows the transaction.
    oct_before = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert oct_before["expense_total"] == "500.00"

    # PATCH: move date to November 2026 (auto-creates November book).
    url = reverse("transaction-detail", args=[txn.id])
    resp = _patch(auth_client, url, {"transaction_date": "2026-11-05"})
    assert resp.status_code == 200
    assert resp.json()["transaction_date"] == "2026-11-05"

    # Oct 2026 no longer has it.
    oct_after = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert oct_after["expense_total"] == "0.00"

    # Nov 2026 now has it.
    nov = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 11}).json()
    assert nov["expense_total"] == "500.00"


# ---------------------------------------------------------------------------
# 6. Archived-book transactions remain in reports and budget spending
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_archived_book_transactions_visible_in_reports_and_budget(
    user, event_book, auth_client
):
    """
    Archiving a book must NOT remove its transactions from:
    - Book report (still accessible and reportable)
    - Monthly overall budget spending
    - Monthly report totals
    """
    monthly_bud = _monthly_budget(user, "10000.00")
    _txn(user, event_book, "300.00", DATE(2026, 10, 5))

    # Archive the event book.
    archive_book(event_book)

    # Book report still shows the transaction.
    book_report = auth_client.get(reverse("report-book", args=[event_book.id])).json()
    assert book_report["book"]["is_archived"] is True
    assert book_report["expense_total"] == "300.00"

    # Monthly report still counts it.
    monthly = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert monthly["expense_total"] == "300.00"
    event_row = next(r for r in monthly["book_type_breakdown"] if r["book_type"] == "EVENT")
    assert event_row["expenses"] == "300.00"

    # Monthly overall budget still tracks the spending.
    bud_detail = auth_client.get(reverse("budget-detail", args=[monthly_bud.id])).json()
    assert bud_detail["spent"] == "300.00"


# ---------------------------------------------------------------------------
# 7. Opening balance excluded from income; closing balance formula correct
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_opening_balance_not_income_closing_balance_formula(user, general_book, food, salary_cat, auth_client):
    """
    closing_balance = opening_balance + income_total - expense_total.
    opening_balance is not income; it is never added to income_total.
    """
    from khaata.apps.books.models import Book
    Book.objects.filter(pk=general_book.pk).update(opening_balance=D("5000.00"))

    _txn(user, general_book, "10000.00", DATE(2026, 10, 3), txn_type="INCOME", category=salary_cat)
    _txn(user, general_book, "3000.00", DATE(2026, 10, 4), category=food)

    report = auth_client.get(reverse("report-book", args=[general_book.id])).json()
    assert report["income_total"] == "10000.00"  # opening balance NOT included
    assert report["expense_total"] == "3000.00"
    assert report["net_cash_flow"] == "7000.00"
    assert report["closing_balance"] == "12000.00"  # 5000 + 10000 - 3000


# ---------------------------------------------------------------------------
# 8. Budget overspending never blocks a transaction write
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_budget_overspend_never_blocks_transaction(user, general_book, food, auth_client):
    """
    BR-05 / ADR-012: budgets are soft caps. A transaction must always succeed
    even when the budget is already over-limit (BR-05, AGENTS.md § 5).
    """
    _monthly_budget(user, "100.00")
    # First expense brings the budget to on-track.
    _txn(user, general_book, "50.00", DATE(2026, 10, 2), category=food)

    # Second expense takes it over the limit.
    resp = _post(auth_client, reverse("transaction-list-create"), {
        "book_id": str(general_book.id),
        "type": "EXPENSE",
        "amount": "200.00",
        "transaction_date": "2026-10-03",
    })
    assert resp.status_code == 201, resp.content
    assert resp.json()["amount"] == "200.00"

    # Budget now shows OVER_BUDGET but both transactions exist.
    c = auth_client
    monthly = c.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert monthly["budget"]["status"] == "OVER_BUDGET"
    assert monthly["budget"]["spent"] == "250.00"
    assert monthly["budget"]["remaining"] == "-150.00"


# ---------------------------------------------------------------------------
# 9. Monthly report: each transaction counted exactly once
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_monthly_report_counts_each_transaction_once(user, monthly_book, event_book, general_book):
    """
    A transaction belongs to exactly one book; the monthly report's totals must
    equal the sum of the individual book-type breakdown figures, not more.
    """
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    _txn(user, event_book, "200.00", DATE(2026, 10, 2))
    _txn(user, general_book, "50.00", DATE(2026, 10, 3))

    c = Client()
    c.force_login(user)
    report = c.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()

    # Overall total must equal sum of breakdown figures.
    breakdown_total = sum(D(r["expenses"]) for r in report["book_type_breakdown"])
    assert D(report["expense_total"]) == breakdown_total
    assert D(report["expense_total"]) == D("350.00")

    # Exactly 3 transactions — no duplication.
    assert len(report["recent_transactions"]) == 3


# ---------------------------------------------------------------------------
# 10. Budget utilization report matches direct GET /budgets/{id}/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_budget_utilization_report_matches_budget_detail(user, general_book, food, auth_client):
    """
    GET /reports/budget-utilization/ budget block must be byte-for-byte
    identical to GET /budgets/{id}/ for the same budget.
    """
    budget = _monthly_budget(user, "1000.00")
    replace_allocations(user, budget.id, [{"category_id": food.id, "amount": D("600.00")}])
    _txn(user, general_book, "400.00", DATE(2026, 10, 3), category=food)

    util = auth_client.get(reverse("report-budget-utilization"), {"year": 2026, "month": 10}).json()
    detail = auth_client.get(reverse("budget-detail", args=[budget.id])).json()
    assert util["budget"] == detail


# ---------------------------------------------------------------------------
# 11. Cross-user data isolation across all endpoints
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_cross_user_isolation_across_all_endpoints(user, other_user, general_book, food, auth_client):
    """
    No endpoint must ever return another user's data. All path-param lookups must
    resolve to 404 for resources owned by other users, not 403 or 200.
    """
    # Set up other user's data.
    their_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    their_event = create_book(other_user, {"type": BookType.EVENT, "name": "Their Event"})
    their_cat = Category.objects.create(owner=other_user, name="Secret", type="EXPENSE")
    their_pm = PaymentMethod.objects.create(owner=other_user, name="SecretPM")
    their_txn = _txn(other_user, their_book, "9999.00", DATE(2026, 10, 1))
    _monthly_budget(other_user, "1.00")
    _event_budget(other_user, their_event, "5.00")

    # Also add our own data so the counts are meaningful.
    _txn(user, general_book, "1.00", DATE(2026, 10, 1), category=food)

    # ---------- GET /transactions/ ----------
    txn_list = auth_client.get(reverse("transaction-list-create")).json()
    assert txn_list["count"] == 1
    assert all(r["id"] != str(their_txn.id) for r in txn_list["results"])

    # ---------- GET /transactions/{id}/ ----------
    assert auth_client.get(reverse("transaction-detail", args=[their_txn.id])).status_code == 404

    # ---------- GET /books/{id}/ ----------
    assert auth_client.get(reverse("book-detail", args=[their_book.id])).status_code == 404

    # ---------- GET /categories/ ----------
    cat_list = auth_client.get(reverse("category-list-create")).json()
    cat_names = [c["name"] for c in cat_list["results"]]
    assert "Secret" not in cat_names

    # ---------- GET /payment-methods/ ----------
    pm_list = auth_client.get(reverse("payment-method-list-create")).json()
    pm_names = [p["name"] for p in pm_list["results"]]
    assert "SecretPM" not in pm_names

    # ---------- GET /reports/monthly/ ----------
    monthly = auth_client.get(reverse("report-monthly"), {"year": 2026, "month": 10}).json()
    assert D(monthly["expense_total"]) == D("1.00")
    assert monthly["budget"]["status"] == "NOT_SET"
    body_str = json.dumps(monthly)
    assert "9999" not in body_str
    assert "Secret" not in body_str

    # ---------- GET /reports/books/{id}/ (other user's book) ----------
    assert auth_client.get(reverse("report-book", args=[their_book.id])).status_code == 404

    # ---------- GET /budgets/ ----------
    bud_list = auth_client.get(reverse("budget-list-create")).json()
    assert bud_list["count"] == 0  # our user has no budget

    # ---------- GET /exports/transactions.csv ----------
    csv_resp = auth_client.get("/api/v1/exports/transactions.csv")
    rows = _parse_csv(csv_resp.content)
    assert all(r["id"] != str(their_txn.id) for r in rows)
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# 12. Error response envelope is consistent across all modules
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_error_envelope_shape_is_consistent_across_modules(auth_client, general_book):
    """
    Every 400/401/404 response must follow the standard envelope:
    {"error": {"code": "...", "message": "...", "details": {...}}}
    """
    def _assert_envelope(resp, expected_code):
        assert resp.status_code in (400, 401, 404, 405)
        body = resp.json()
        assert "error" in body, f"Missing 'error' key: {body}"
        err = body["error"]
        assert "code" in err and "message" in err and "details" in err, f"Bad envelope: {err}"
        if expected_code:
            assert err["code"] == expected_code

    # 401: unauthenticated access to every major endpoint.
    anon = Client()
    for path in [
        "/api/v1/transactions/",
        "/api/v1/books/",
        "/api/v1/categories/",
        "/api/v1/payment-methods/",
        "/api/v1/budgets/",
    ]:
        _assert_envelope(anon.get(path), "not_authenticated")

    # 400: validation error on transaction create.
    _assert_envelope(
        _post(auth_client, reverse("transaction-list-create"), {"type": "EXPENSE", "amount": "1.00"}),
        "validation_error",
    )

    # 400: validation error on budget create (missing scope).
    _assert_envelope(
        _post(auth_client, reverse("budget-list-create"), {"total_limit": "1.00"}),
        "validation_error",
    )

    # 404: unknown transaction id.
    _assert_envelope(
        auth_client.get(reverse("transaction-detail", args=[uuid.uuid4()])),
        "not_found",
    )

    # 404: unknown book id in reports.
    _assert_envelope(
        auth_client.get(reverse("report-book", args=[uuid.uuid4()])),
        "not_found",
    )

    # 405: wrong HTTP method.
    _assert_envelope(
        auth_client.delete(reverse("transaction-list-create")),
        "method_not_allowed",
    )


# ---------------------------------------------------------------------------
# 13. Category deactivation: historical transactions preserved, new rejected
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_historical_reference_preserved_after_category_deactivation(
    user, general_book, food, auth_client
):
    """
    A transaction with an inactive category must:
    - Still be readable (GET /transactions/{id}/)
    - Still appear in budget category_breakdown
    - Not allow a NEW transaction to use the inactive category (400)
    """
    txn = _txn(user, general_book, "50.00", DATE(2026, 10, 3), category=food)
    budget = _monthly_budget(user, "1000.00")

    # Deactivate the category.
    food.is_active = False
    food.save()

    # Existing transaction still readable with the inactive category.
    detail = auth_client.get(reverse("transaction-detail", args=[txn.id])).json()
    assert detail["category"]["id"] == str(food.id)
    assert detail["category"]["name"] == "Food"

    # Budget spending breakdown still shows the categorised spend.
    bud = auth_client.get(reverse("budget-detail", args=[budget.id])).json()
    assert bud["spent"] == "50.00"

    # New transaction with the inactive category is rejected.
    resp = _post(auth_client, reverse("transaction-list-create"), {
        "book_id": str(general_book.id),
        "type": "EXPENSE",
        "amount": "10.00",
        "transaction_date": "2026-10-05",
        "category_id": str(food.id),
    })
    assert resp.status_code == 400
    assert "category_id" in resp.json()["error"]["details"]


# ---------------------------------------------------------------------------
# 14. CSV consistency with the transaction list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_csv_export_consistent_with_transaction_list(
    user, monthly_book, general_book, food, cash, auth_client
):
    """
    The CSV export must contain exactly the same IDs, amounts and dates as the
    GET /transactions/ list for the same filter parameters, just in CSV form.
    """
    t1 = _txn(user, monthly_book, "100.00", DATE(2026, 10, 3), category=food, payment_method=cash, description="A")
    t2 = _txn(user, general_book, "200.00", DATE(2026, 10, 5))
    t3 = _txn(user, monthly_book, "50.00", DATE(2026, 10, 7), description="=MALICIOUS")

    # Soft-delete t2; it must not appear in either export or list.
    soft_delete_transaction(user, t2.id)

    params = {"book_id": str(monthly_book.id)}
    list_resp = auth_client.get(reverse("transaction-list-create"), params).json()
    list_ids = {r["id"] for r in list_resp["results"]}

    csv_resp = auth_client.get("/api/v1/exports/transactions.csv", params)
    assert csv_resp.status_code == 200
    rows = _parse_csv(csv_resp.content)
    csv_ids = {r["id"] for r in rows}

    assert list_ids == csv_ids, f"List IDs: {list_ids}, CSV IDs: {csv_ids}"
    assert str(t2.id) not in csv_ids

    # Formula injection escaping: description starting with "=" is tab-prefixed.
    t3_row = next(r for r in rows if r["id"] == str(t3.id))
    assert t3_row["description"].startswith("\t"), f"Expected tab-prefix, got: {t3_row['description']!r}"

    # Amount is decimal string; date is ISO 8601.
    t1_row = next(r for r in rows if r["id"] == str(t1.id))
    assert t1_row["amount"] == "100.00"
    assert t1_row["transaction_date"] == "2026-10-03"
    assert t1_row["category_name"] == "Food"
    assert t1_row["payment_method_name"] == "Cash"
