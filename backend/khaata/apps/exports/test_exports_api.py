"""
API integration tests for the CSV export endpoint (BE-008):
GET /api/v1/exports/transactions.csv

Covers:
- Successful export with data
- Empty result set
- All supported filters (book_id, type, category_id, payment_method_id,
  date_from, date_to, search) individually and combined
- Malformed filter values → 400
- Unauthenticated request → 401
- Cross-user data isolation (never exports another user's transactions)
- Soft-deleted transactions are excluded
- Formula-injection escaping (=, +, -, @ prefixes)
- CSV structure: correct headers, correct column count per row, correct
  content-type and Content-Disposition
- Ordering: default -transaction_date, -created_at, -id
"""
import csv
import datetime
import io
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from khaata.apps.books.models import BookType
from khaata.apps.books.services import create_book, ensure_monthly_book
from khaata.apps.transactions.models import Category, PaymentMethod, Transaction
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()

EXPORT_URL = "/api/v1/exports/transactions.csv"
EXPORT_NAME = "export-transactions-csv"

D = Decimal
DATE = datetime.date

_EXPECTED_HEADERS = [
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(email="csvexp@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="csvexp2@example.com", password="SecurePassword123!")


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
def expense_cat(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


@pytest.fixture
def income_cat(user):
    return Category.objects.create(owner=user, name="Salary", type="INCOME")


@pytest.fixture
def payment_method(user):
    return PaymentMethod.objects.create(owner=user, name="Cash")


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


def _parse_csv(response) -> tuple[list[str], list[dict]]:
    """Parse response content into (headers, list_of_row_dicts)."""
    content = response.content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    headers = reader.fieldnames or []
    rows = list(reader)
    return list(headers), rows


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unauthenticated_request_returns_401(client):
    """GET /exports/transactions.csv without a session → 401."""
    response = client.get(EXPORT_URL)
    assert response.status_code == 401


@pytest.mark.django_db
def test_url_name_resolves():
    """Named URL 'export-transactions-csv' resolves correctly."""
    assert reverse(EXPORT_NAME) == EXPORT_URL


# ---------------------------------------------------------------------------
# Response shape and headers
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_response_content_type(auth_client, monthly_book):
    """Response must have content-type text/csv; charset=utf-8."""
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    assert "text/csv" in response["Content-Type"]
    assert "charset=utf-8" in response["Content-Type"].lower()


@pytest.mark.django_db
def test_response_content_disposition(auth_client, monthly_book):
    """Response must have Content-Disposition: attachment; filename=transactions.csv."""
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    cd = response["Content-Disposition"]
    assert "attachment" in cd
    assert "transactions.csv" in cd


@pytest.mark.django_db
def test_csv_headers_present(auth_client, monthly_book):
    """CSV must start with the documented column headers."""
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    headers, _rows = _parse_csv(response)
    assert headers == _EXPECTED_HEADERS


# ---------------------------------------------------------------------------
# Empty export
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_empty_export_has_only_header_row(auth_client, monthly_book):
    """When the user has no transactions, only the header row is returned."""
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    headers, rows = _parse_csv(response)
    assert headers == _EXPECTED_HEADERS
    assert rows == []


# ---------------------------------------------------------------------------
# Successful export with data
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_export_returns_all_user_active_transactions(auth_client, user, monthly_book, event_book):
    """All active transactions of the user across all books are exported."""
    t1 = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    t2 = _txn(user, event_book, "200.00", DATE(2026, 10, 5))
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    headers, rows = _parse_csv(response)
    assert headers == _EXPECTED_HEADERS
    assert len(rows) == 2
    exported_ids = {r["id"] for r in rows}
    assert str(t1.id) in exported_ids
    assert str(t2.id) in exported_ids


@pytest.mark.django_db
def test_export_column_values(auth_client, user, monthly_book, expense_cat, payment_method):
    """Each column maps to the expected transaction field value."""
    txn = _txn(
        user,
        monthly_book,
        "350.50",
        DATE(2026, 10, 15),
        txn_type="EXPENSE",
        category=expense_cat,
        payment_method=payment_method,
        description="Dinner at home",
    )
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == str(txn.id)
    assert row["book_id"] == str(monthly_book.id)
    assert row["type"] == "EXPENSE"
    assert row["amount"] == "350.50"
    assert row["transaction_date"] == "2026-10-15"
    assert row["category_id"] == str(expense_cat.id)
    assert row["category_name"] == "Food"
    assert row["payment_method_id"] == str(payment_method.id)
    assert row["payment_method_name"] == "Cash"
    assert row["description"] == "Dinner at home"
    # created_at and updated_at are ISO timestamps (non-empty)
    assert row["created_at"]
    assert row["updated_at"]


@pytest.mark.django_db
def test_export_null_category_and_payment_method(auth_client, user, monthly_book):
    """Null category and payment method are exported as empty strings."""
    _txn(user, monthly_book, "50.00", DATE(2026, 10, 10))
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    row = rows[0]
    assert row["category_id"] == ""
    assert row["category_name"] == ""
    assert row["payment_method_id"] == ""
    assert row["payment_method_name"] == ""


@pytest.mark.django_db
def test_export_amount_is_decimal_string(auth_client, user, monthly_book):
    """Amount is exported as a decimal string, not a float."""
    _txn(user, monthly_book, "1234.56", DATE(2026, 10, 1))
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["amount"] == "1234.56"


@pytest.mark.django_db
def test_export_dates_are_iso_format(auth_client, user, monthly_book):
    """Dates are exported in ISO 8601 (YYYY-MM-DD) format."""
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 3))
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["transaction_date"] == "2026-10-03"


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_export_default_ordering(auth_client, user, monthly_book):
    """Rows are ordered -transaction_date, -created_at, -id by default."""
    t1 = _txn(user, monthly_book, "10.00", DATE(2026, 10, 1))
    t2 = _txn(user, monthly_book, "20.00", DATE(2026, 10, 5))
    t3 = _txn(user, monthly_book, "30.00", DATE(2026, 10, 3))
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    dates = [r["transaction_date"] for r in rows]
    # latest date first
    assert dates == ["2026-10-05", "2026-10-03", "2026-10-01"]
    ids = [r["id"] for r in rows]
    assert ids == [str(t2.id), str(t3.id), str(t1.id)]


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_filter_by_book_id(auth_client, user, monthly_book, event_book):
    """book_id filter restricts export to transactions in that book."""
    t1 = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    _txn(user, event_book, "200.00", DATE(2026, 10, 2))
    response = auth_client.get(EXPORT_URL, {"book_id": str(monthly_book.id)})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(t1.id)


@pytest.mark.django_db
def test_filter_by_type_expense(auth_client, user, monthly_book):
    """type=EXPENSE filter returns only expense transactions."""
    expense = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), txn_type="EXPENSE")
    _txn(user, monthly_book, "5000.00", DATE(2026, 10, 2), txn_type="INCOME")
    response = auth_client.get(EXPORT_URL, {"type": "EXPENSE"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(expense.id)


@pytest.mark.django_db
def test_filter_by_type_income(auth_client, user, monthly_book):
    """type=INCOME filter returns only income transactions."""
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), txn_type="EXPENSE")
    income = _txn(user, monthly_book, "5000.00", DATE(2026, 10, 2), txn_type="INCOME")
    response = auth_client.get(EXPORT_URL, {"type": "INCOME"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(income.id)


@pytest.mark.django_db
def test_filter_by_category_id(auth_client, user, monthly_book, expense_cat):
    """category_id filter restricts export to transactions in that category."""
    t_cat = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), category=expense_cat)
    _txn(user, monthly_book, "50.00", DATE(2026, 10, 2))  # no category
    response = auth_client.get(EXPORT_URL, {"category_id": str(expense_cat.id)})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(t_cat.id)


@pytest.mark.django_db
def test_filter_by_payment_method_id(auth_client, user, monthly_book, payment_method):
    """payment_method_id filter restricts export to matching transactions."""
    t_pm = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), payment_method=payment_method)
    _txn(user, monthly_book, "50.00", DATE(2026, 10, 2))  # no payment method
    response = auth_client.get(EXPORT_URL, {"payment_method_id": str(payment_method.id)})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(t_pm.id)


@pytest.mark.django_db
def test_filter_by_date_from(auth_client, user, monthly_book):
    """date_from filter excludes transactions before that date."""
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    t2 = _txn(user, monthly_book, "200.00", DATE(2026, 10, 10))
    t3 = _txn(user, monthly_book, "300.00", DATE(2026, 10, 15))
    response = auth_client.get(EXPORT_URL, {"date_from": "2026-10-10"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 2
    ids = {r["id"] for r in rows}
    assert str(t2.id) in ids
    assert str(t3.id) in ids


@pytest.mark.django_db
def test_filter_by_date_to(auth_client, user, monthly_book):
    """date_to filter excludes transactions after that date."""
    t1 = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    t2 = _txn(user, monthly_book, "200.00", DATE(2026, 10, 5))
    _txn(user, monthly_book, "300.00", DATE(2026, 10, 20))
    response = auth_client.get(EXPORT_URL, {"date_to": "2026-10-05"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 2
    ids = {r["id"] for r in rows}
    assert str(t1.id) in ids
    assert str(t2.id) in ids


@pytest.mark.django_db
def test_filter_by_date_range(auth_client, user, monthly_book):
    """date_from and date_to together form a closed interval."""
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 1))
    t2 = _txn(user, monthly_book, "20.00", DATE(2026, 10, 5))
    t3 = _txn(user, monthly_book, "30.00", DATE(2026, 10, 10))
    _txn(user, monthly_book, "40.00", DATE(2026, 10, 20))
    response = auth_client.get(EXPORT_URL, {"date_from": "2026-10-05", "date_to": "2026-10-10"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 2
    ids = {r["id"] for r in rows}
    assert str(t2.id) in ids
    assert str(t3.id) in ids


@pytest.mark.django_db
def test_filter_by_search(auth_client, user, monthly_book):
    """search filter is a case-insensitive substring match on description."""
    t_match = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), description="Coffee at office")
    _txn(user, monthly_book, "200.00", DATE(2026, 10, 2), description="Taxi fare")
    response = auth_client.get(EXPORT_URL, {"search": "coffee"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(t_match.id)


@pytest.mark.django_db
def test_combined_filters(auth_client, user, monthly_book, event_book, expense_cat):
    """Multiple filters combine with AND semantics."""
    t_target = _txn(
        user, monthly_book, "100.00", DATE(2026, 10, 10),
        txn_type="EXPENSE", category=expense_cat, description="Lunch"
    )
    # Different book
    _txn(user, event_book, "100.00", DATE(2026, 10, 10), txn_type="EXPENSE", category=expense_cat)
    # Different type
    _txn(user, monthly_book, "5000.00", DATE(2026, 10, 10), txn_type="INCOME")
    # Outside date range
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), txn_type="EXPENSE", category=expense_cat)

    response = auth_client.get(EXPORT_URL, {
        "book_id": str(monthly_book.id),
        "type": "EXPENSE",
        "category_id": str(expense_cat.id),
        "date_from": "2026-10-05",
        "date_to": "2026-10-15",
    })
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    assert rows[0]["id"] == str(t_target.id)


# ---------------------------------------------------------------------------
# Malformed filter values → 400
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_invalid_book_id_returns_400(auth_client):
    """Malformed UUID in book_id → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"book_id": "not-a-uuid"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_type_returns_400(auth_client):
    """Unrecognised type value → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"type": "TRANSFER"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_date_from_returns_400(auth_client):
    """Malformed date_from → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"date_from": "not-a-date"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_date_to_returns_400(auth_client):
    """Malformed date_to → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"date_to": "31-10-2026"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_category_id_returns_400(auth_client):
    """Malformed UUID in category_id → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"category_id": "bad-uuid"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_payment_method_id_returns_400(auth_client):
    """Malformed UUID in payment_method_id → 400 validation error."""
    response = auth_client.get(EXPORT_URL, {"payment_method_id": "bad-uuid"})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Cross-user data isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_cross_user_isolation(client, user, other_user):
    """Transactions of other_user are never exported by user."""
    # Create transactions for other_user
    other_book = ensure_monthly_book(other_user, 2026, 10)[0]
    _txn(other_user, other_book, "999.00", DATE(2026, 10, 1))

    # Create transaction for the authenticated user
    my_book = ensure_monthly_book(user, 2026, 10)[0]
    my_txn = _txn(user, my_book, "111.00", DATE(2026, 10, 2))

    client.force_login(user)
    response = client.get(EXPORT_URL)
    assert response.status_code == 200
    _, rows = _parse_csv(response)

    exported_ids = {r["id"] for r in rows}
    assert str(my_txn.id) in exported_ids
    # The other user's transaction must NOT be present
    other_txns = Transaction.objects.filter(book__owner=other_user)
    for other_txn in other_txns:
        assert str(other_txn.id) not in exported_ids


@pytest.mark.django_db
def test_another_users_book_id_filter_returns_empty(auth_client, user, other_user):
    """Filtering by another user's book_id returns no rows (not a 404)."""
    other_book = ensure_monthly_book(other_user, 2026, 10)[0]
    # other_user has a transaction in that book
    _txn(other_user, other_book, "500.00", DATE(2026, 10, 1))
    # authenticated user also has their own book and transaction
    my_book = ensure_monthly_book(user, 2026, 10)[0]
    _txn(user, my_book, "200.00", DATE(2026, 10, 1))

    response = auth_client.get(EXPORT_URL, {"book_id": str(other_book.id)})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    # The filter is valid (UUID), but no owned transaction matches the other
    # user's book, so the result is empty — not an error.
    assert rows == []


# ---------------------------------------------------------------------------
# Soft-deleted records excluded
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_soft_deleted_transactions_are_excluded(auth_client, user, monthly_book):
    """Soft-deleted transactions must not appear in the export."""
    active = _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    deleted = _txn(user, monthly_book, "200.00", DATE(2026, 10, 2))
    soft_delete_transaction(user, deleted.id)

    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    exported_ids = {r["id"] for r in rows}
    assert str(active.id) in exported_ids
    assert str(deleted.id) not in exported_ids


# ---------------------------------------------------------------------------
# Formula-injection escaping
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("prefix", ["=", "+", "-", "@"])
def test_formula_injection_in_description_is_escaped(auth_client, user, monthly_book, prefix):
    """Descriptions starting with formula characters are prefixed with a tab."""
    dangerous = f"{prefix}SUM(A1:A10)"
    _txn(user, monthly_book, "50.00", DATE(2026, 10, 1), description=dangerous)
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
    # The exported value must start with a tab, not the formula character
    assert rows[0]["description"].startswith("\t")
    assert rows[0]["description"] == "\t" + dangerous


@pytest.mark.django_db
@pytest.mark.parametrize("prefix", ["=", "+", "-", "@"])
def test_formula_injection_in_category_name_is_escaped(auth_client, user, monthly_book, prefix):
    """Category names starting with formula characters are escaped."""
    cat = Category.objects.create(
        owner=user, name=f"{prefix}Danger", type="EXPENSE"
    )
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), category=cat)
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["category_name"].startswith("\t")


@pytest.mark.django_db
@pytest.mark.parametrize("prefix", ["=", "+", "-", "@"])
def test_formula_injection_in_payment_method_name_is_escaped(auth_client, user, monthly_book, prefix):
    """Payment method names starting with formula characters are escaped."""
    pm = PaymentMethod.objects.create(owner=user, name=f"{prefix}DangerPay")
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), payment_method=pm)
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["payment_method_name"].startswith("\t")


@pytest.mark.django_db
def test_safe_description_not_escaped(auth_client, user, monthly_book):
    """Regular descriptions that do not start with formula chars are unchanged."""
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1), description="Grocery run")
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["description"] == "Grocery run"


@pytest.mark.django_db
def test_null_description_exported_as_empty_string(auth_client, user, monthly_book):
    """A null description is exported as an empty string (not 'None')."""
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    response = auth_client.get(EXPORT_URL)
    _, rows = _parse_csv(response)
    assert rows[0]["description"] == ""


# ---------------------------------------------------------------------------
# Row completeness
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_every_row_has_correct_column_count(auth_client, user, monthly_book, event_book, expense_cat, payment_method):
    """Every data row must have the same number of columns as the header."""
    _txn(user, monthly_book, "10.00", DATE(2026, 10, 1))
    _txn(user, monthly_book, "20.00", DATE(2026, 10, 2), category=expense_cat, payment_method=payment_method, description="Test")
    _txn(user, event_book, "30.00", DATE(2026, 10, 3), txn_type="EXPENSE")
    response = auth_client.get(EXPORT_URL)
    assert response.status_code == 200
    # Parse raw lines to check column count directly
    lines = response.content.decode("utf-8").splitlines()
    reader = csv.reader(lines)
    header = next(reader)
    for row in reader:
        assert len(row) == len(header), f"Row has {len(row)} columns, expected {len(header)}"


# ---------------------------------------------------------------------------
# No unintended query parameter is silently ignored (ordering not supported)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unknown_query_param_is_silently_ignored(auth_client, user, monthly_book):
    """
    Unknown query params (e.g. ordering) are silently ignored — the endpoint
    does not 400 on unknown parameters (same behaviour as transaction list view
    for ordering: unknown values fall back to default).
    """
    _txn(user, monthly_book, "100.00", DATE(2026, 10, 1))
    response = auth_client.get(EXPORT_URL, {"ordering": "-amount", "foo": "bar"})
    assert response.status_code == 200
    _, rows = _parse_csv(response)
    assert len(rows) == 1
