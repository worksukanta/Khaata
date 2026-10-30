"""
API integration tests for transactions (BE-005):
GET/POST /api/v1/transactions/ and GET/PATCH/DELETE /api/v1/transactions/{id}/.
"""
import datetime
import json
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import create_book, ensure_monthly_book
from khaata.apps.transactions.models import Category, PaymentMethod, Transaction

User = get_user_model()

LIST = "transaction-list-create"
DETAIL = "transaction-detail"
D = datetime.date


def _post(client, url, payload, **extra):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **extra)


def _patch(client, url, payload, **extra):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **extra)


@pytest.fixture
def user():
    return User.objects.create_user(email="txapi@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="txapi2@example.com", password="SecurePassword123!")


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


@pytest.fixture
def csrf_client(user):
    c = Client(enforce_csrf_checks=True)
    c.force_login(user)
    return c


def _csrf_token(c):
    return c.get(reverse("auth-csrf")).cookies["csrftoken"].value


@pytest.fixture
def october(user):
    return ensure_monthly_book(user, 2026, 10)[0]


@pytest.fixture
def event_book(user):
    return create_book(user, {"type": BookType.EVENT, "name": "Puja"})


@pytest.fixture
def expense_cat(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


@pytest.fixture
def income_cat(user):
    return Category.objects.create(owner=user, name="Salary", type="INCOME")


@pytest.fixture
def method(user):
    return PaymentMethod.objects.create(owner=user, name="Cash")


def _body(book, **overrides):
    data = {
        "book_id": str(book.id),
        "type": "EXPENSE",
        "amount": "250.00",
        "transaction_date": "2026-10-27",
    }
    data.update(overrides)
    return data


def _make(client, book, **overrides):
    resp = _post(client, reverse(LIST), _body(book, **overrides))
    assert resp.status_code == 201, resp.content
    return resp.json()


def _err(resp, field):
    body = resp.json()
    assert body["error"]["code"] == "validation_error"
    assert field in body["error"]["details"], body
    return body["error"]["details"][field]


# ---------------------------------------------------------------------------
# Authentication & CSRF
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_endpoints_require_authentication(client):
    tid = uuid.uuid4()
    assert client.get(reverse(LIST)).status_code == 401
    assert _post(client, reverse(LIST), {}).status_code in (401, 403)
    assert client.get(reverse(DETAIL, args=[tid])).status_code == 401
    assert _patch(client, reverse(DETAIL, args=[tid]), {}).status_code in (401, 403)
    assert client.delete(reverse(DETAIL, args=[tid])).status_code in (401, 403)


@pytest.mark.django_db
def test_state_changing_requests_enforce_csrf(csrf_client, october):
    token = _csrf_token(csrf_client)
    url = reverse(LIST)
    assert _post(csrf_client, url, _body(october)).status_code == 403
    created = _post(csrf_client, url, _body(october), HTTP_X_CSRFTOKEN=token)
    assert created.status_code == 201
    detail = reverse(DETAIL, args=[created.json()["id"]])
    assert _patch(csrf_client, detail, {"amount": "1.00"}).status_code == 403
    assert _patch(csrf_client, detail, {"amount": "1.00"}, HTTP_X_CSRFTOKEN=token).status_code == 200
    assert csrf_client.delete(detail).status_code == 403
    assert csrf_client.delete(detail, HTTP_X_CSRFTOKEN=token).status_code == 204


@pytest.mark.django_db
def test_get_does_not_require_csrf(csrf_client):
    assert csrf_client.get(reverse(LIST)).status_code == 200


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_expense_response_shape(auth_client, october, expense_cat, method):
    resp = _post(
        auth_client,
        reverse(LIST),
        _body(october, category_id=str(expense_cat.id), payment_method_id=str(method.id), description="Evening snacks"),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert set(data) == {
        "id", "book_id", "type", "amount", "transaction_date", "category",
        "payment_method", "description", "created_at", "updated_at",
    }
    assert data["book_id"] == str(october.id)
    assert data["type"] == "EXPENSE"
    assert data["amount"] == "250.00"
    assert data["transaction_date"] == "2026-10-27"
    assert data["category"] == {"id": str(expense_cat.id), "name": "Food", "type": "EXPENSE"}
    assert data["payment_method"] == {"id": str(method.id), "name": "Cash"}
    assert data["description"] == "Evening snacks"
    assert Transaction.objects.get(pk=data["id"]).amount == Decimal("250.00")


@pytest.mark.django_db
def test_create_income(auth_client, october, income_cat):
    data = _make(auth_client, october, type="INCOME", category_id=str(income_cat.id), amount="50000")
    assert data["type"] == "INCOME" and data["amount"] == "50000.00"


@pytest.mark.django_db
def test_create_with_null_references(auth_client, october):
    data = _make(auth_client, october, category_id=None, payment_method_id=None)
    assert data["category"] is None and data["payment_method"] is None


@pytest.mark.django_db
@pytest.mark.parametrize("missing", ["book_id", "type", "amount", "transaction_date"])
def test_create_required_fields(auth_client, october, missing):
    body = _body(october)
    del body[missing]
    resp = _post(auth_client, reverse(LIST), body)
    assert resp.status_code == 400
    _err(resp, missing)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "amount", ["0", "0.00", "-5.00", "0.001", "10.001", "abc", "", None, "1e3x", "1000000000000.00"]
)
def test_create_rejects_invalid_amounts(auth_client, october, amount):
    resp = _post(auth_client, reverse(LIST), _body(october, amount=amount))
    assert resp.status_code == 400
    _err(resp, "amount")
    assert Transaction.all_objects.count() == 0


@pytest.mark.django_db
def test_create_zero_amount_message(auth_client, october):
    resp = _post(auth_client, reverse(LIST), _body(october, amount="0.00"))
    assert _err(resp, "amount") == ["Ensure this value is greater than zero."]


@pytest.mark.django_db
@pytest.mark.parametrize("amount, expected", [("0.01", "0.01"), ("999999999999.99", "999999999999.99"), ("12.5", "12.50")])
def test_create_boundary_amounts(auth_client, october, amount, expected):
    assert _make(auth_client, october, amount=amount)["amount"] == expected


@pytest.mark.django_db
def test_create_accepts_numeric_json_amount_as_exact_decimal(auth_client, october):
    resp = _post(auth_client, reverse(LIST), _body(october, amount=0.1))
    assert resp.status_code == 201
    assert resp.json()["amount"] == "0.10"


@pytest.mark.django_db
@pytest.mark.parametrize("type_", ["TRANSFER", "income", "", None])
def test_create_rejects_invalid_type(auth_client, october, type_):
    resp = _post(auth_client, reverse(LIST), _body(october, type=type_))
    assert resp.status_code == 400
    _err(resp, "type")


@pytest.mark.django_db
@pytest.mark.parametrize("date", ["2026-13-01", "2026-02-30", "27/10/2026", "", None])
def test_create_rejects_invalid_date(auth_client, october, date):
    resp = _post(auth_client, reverse(LIST), _body(october, transaction_date=date))
    assert resp.status_code == 400
    _err(resp, "transaction_date")


@pytest.mark.django_db
def test_create_leap_day_and_year_end_boundaries(auth_client, user):
    feb = ensure_monthly_book(user, 2028, 2)[0]
    dec = ensure_monthly_book(user, 2026, 12)[0]
    assert _make(auth_client, feb, transaction_date="2028-02-29")["transaction_date"] == "2028-02-29"
    assert _make(auth_client, dec, transaction_date="2026-12-31")["transaction_date"] == "2026-12-31"
    resp = _post(auth_client, reverse(LIST), _body(dec, transaction_date="2027-01-01"))
    assert resp.status_code == 400
    _err(resp, "transaction_date")


@pytest.mark.django_db
def test_create_description_validation(auth_client, october):
    resp = _post(auth_client, reverse(LIST), _body(october, description="x" * 501))
    assert resp.status_code == 400
    _err(resp, "description")
    assert _make(auth_client, october, description="x" * 500)["description"] == "x" * 500


@pytest.mark.django_db
def test_create_rejects_malformed_uuids(auth_client, october):
    for field in ("book_id", "category_id", "payment_method_id"):
        resp = _post(auth_client, reverse(LIST), _body(october, **{field: "not-a-uuid"}))
        assert resp.status_code == 400
        _err(resp, field)


@pytest.mark.django_db
def test_create_rejects_category_type_mismatch(auth_client, october, income_cat, expense_cat):
    resp = _post(auth_client, reverse(LIST), _body(october, type="EXPENSE", category_id=str(income_cat.id)))
    assert resp.status_code == 400
    _err(resp, "category_id")
    resp = _post(auth_client, reverse(LIST), _body(october, type="INCOME", category_id=str(expense_cat.id)))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_rejects_inactive_category(auth_client, october, expense_cat):
    expense_cat.is_active = False
    expense_cat.save()
    resp = _post(auth_client, reverse(LIST), _body(october, category_id=str(expense_cat.id)))
    assert resp.status_code == 400
    _err(resp, "category_id")
    expense_cat.is_active = True
    expense_cat.save()
    assert _post(auth_client, reverse(LIST), _body(october, category_id=str(expense_cat.id))).status_code == 201


@pytest.mark.django_db
def test_create_rejects_inactive_payment_method(auth_client, october, method):
    method.is_active = False
    method.save()
    resp = _post(auth_client, reverse(LIST), _body(october, payment_method_id=str(method.id)))
    assert resp.status_code == 400
    _err(resp, "payment_method_id")
    method.is_active = True
    method.save()
    assert _post(auth_client, reverse(LIST), _body(october, payment_method_id=str(method.id))).status_code == 201


@pytest.mark.django_db
def test_create_rejects_cross_user_references(auth_client, other_user):
    their_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    their_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    their_pm = PaymentMethod.objects.create(owner=other_user, name="Cash")
    my_book = create_book(User.objects.get(email="txapi@example.com"), {"type": BookType.GENERAL, "name": "Mine"})

    resp = _post(auth_client, reverse(LIST), _body(their_book))
    assert resp.status_code == 400
    _err(resp, "book_id")
    resp = _post(auth_client, reverse(LIST), _body(my_book, category_id=str(their_cat.id)))
    _err(resp, "category_id")
    resp = _post(auth_client, reverse(LIST), _body(my_book, payment_method_id=str(their_pm.id)))
    _err(resp, "payment_method_id")
    assert Transaction.all_objects.count() == 0


@pytest.mark.django_db
def test_cross_user_and_unknown_references_give_identical_errors(auth_client, other_user, october):
    their_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    foreign = _post(auth_client, reverse(LIST), _body(october, category_id=str(their_cat.id))).json()
    unknown = _post(auth_client, reverse(LIST), _body(october, category_id=str(uuid.uuid4()))).json()
    assert foreign == unknown


@pytest.mark.django_db
def test_create_rejects_archived_book(auth_client, event_book):
    event_book.is_archived = True
    event_book.save()
    resp = _post(auth_client, reverse(LIST), _body(event_book))
    assert resp.status_code == 400
    _err(resp, "book_id")


@pytest.mark.django_db
def test_create_rejects_date_outside_monthly_book(auth_client, october):
    resp = _post(auth_client, reverse(LIST), _body(october, transaction_date="2026-09-30"))
    assert resp.status_code == 400
    _err(resp, "transaction_date")


@pytest.mark.django_db
def test_create_ignores_client_supplied_server_fields(auth_client, october, other_user):
    forged_id = str(uuid.uuid4())
    data = _make(
        auth_client,
        october,
        id=forged_id,
        owner=str(other_user.id),
        owner_id=str(other_user.id),
        deleted_at="2020-01-01T00:00:00Z",
        created_at="2020-01-01T00:00:00Z",
    )
    assert data["id"] != forged_id
    row = Transaction.objects.get(pk=data["id"])
    assert row.deleted_at is None
    assert row.book.owner.email == "txapi@example.com"
    assert row.created_at.year != 2020


# ---------------------------------------------------------------------------
# Retrieve
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_retrieve_own_transaction(auth_client, october):
    created = _make(auth_client, october, description="hello")
    resp = auth_client.get(reverse(DETAIL, args=[created["id"]]))
    assert resp.status_code == 200
    assert resp.json() == created


@pytest.mark.django_db
def test_retrieve_unknown_id_404(auth_client):
    resp = auth_client.get(reverse(DETAIL, args=[uuid.uuid4()]))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_cross_user_detail_access_is_404_and_identical_to_unknown(client, user, other_user, october):
    client.force_login(user)
    created = _make(client, october)
    client.force_login(other_user)
    url = reverse(DETAIL, args=[created["id"]])
    foreign = [client.get(url), _patch(client, url, {"amount": "1.00"}), client.delete(url)]
    unknown_url = reverse(DETAIL, args=[uuid.uuid4()])
    unknown = [client.get(unknown_url), _patch(client, unknown_url, {"amount": "1.00"}), client.delete(unknown_url)]
    for f, u in zip(foreign, unknown):
        assert f.status_code == u.status_code == 404
        assert f.json() == u.json()
    row = Transaction.objects.get(pk=created["id"])
    assert row.amount == Decimal("250.00") and row.deleted_at is None


# ---------------------------------------------------------------------------
# List: scoping, filters, ordering, pagination
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_list_returns_only_own_transactions(client, user, other_user, october):
    client.force_login(user)
    mine = _make(client, october)
    their_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    Transaction.objects.create(
        book=their_book, type="EXPENSE", amount=Decimal("9.00"), transaction_date=D(2026, 10, 1)
    )
    body = client.get(reverse(LIST)).json()
    assert body["count"] == 1
    assert [r["id"] for r in body["results"]] == [mine["id"]]
    assert set(body) == {"count", "next", "previous", "results"}


@pytest.mark.django_db
def test_list_filtering_by_other_users_book_returns_nothing(auth_client, other_user):
    their_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    Transaction.objects.create(
        book=their_book, type="EXPENSE", amount=Decimal("9.00"), transaction_date=D(2026, 10, 1)
    )
    assert auth_client.get(reverse(LIST), {"book_id": str(their_book.id)}).json()["count"] == 0


@pytest.fixture
def dataset(auth_client, user, october, event_book, expense_cat, income_cat, method):
    other_pm = PaymentMethod.objects.create(owner=user, name="UPI")
    rows = {
        "a": _make(auth_client, october, amount="10.00", transaction_date="2026-10-05",
                   category_id=str(expense_cat.id), payment_method_id=str(method.id), description="Coffee beans"),
        "b": _make(auth_client, october, amount="30.00", transaction_date="2026-10-15",
                   description="Lunch"),
        "c": _make(auth_client, october, type="INCOME", amount="500.00", transaction_date="2026-10-20",
                   category_id=str(income_cat.id), payment_method_id=str(other_pm.id), description="Salary"),
        "d": _make(auth_client, event_book, amount="20.00", transaction_date="2026-11-02",
                   description="Puja COFFEE stall"),
    }
    return rows


def _ids(resp):
    assert resp.status_code == 200, resp.content
    return [r["id"] for r in resp.json()["results"]]


@pytest.mark.django_db
def test_list_default_ordering(auth_client, dataset):
    d = dataset
    assert _ids(auth_client.get(reverse(LIST))) == [d["d"]["id"], d["c"]["id"], d["b"]["id"], d["a"]["id"]]


@pytest.mark.django_db
def test_list_default_ordering_ties_broken_by_created_at_desc(auth_client, october):
    first = _make(auth_client, october, transaction_date="2026-10-10")
    second = _make(auth_client, october, transaction_date="2026-10-10")
    assert _ids(auth_client.get(reverse(LIST))) == [second["id"], first["id"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "ordering, expected",
    [
        ("transaction_date", ["a", "b", "c", "d"]),
        ("-transaction_date", ["d", "c", "b", "a"]),
        ("amount", ["a", "d", "b", "c"]),
        ("-amount", ["c", "b", "d", "a"]),
        ("created_at", ["a", "b", "c", "d"]),
        ("-created_at", ["d", "c", "b", "a"]),
    ],
)
def test_list_ordering_parameter(auth_client, dataset, ordering, expected):
    ids = _ids(auth_client.get(reverse(LIST), {"ordering": ordering}))
    assert ids == [dataset[k]["id"] for k in expected]


@pytest.mark.django_db
def test_list_unknown_ordering_falls_back_to_default(auth_client, dataset):
    default = _ids(auth_client.get(reverse(LIST)))
    assert _ids(auth_client.get(reverse(LIST), {"ordering": "description"})) == default
    assert _ids(auth_client.get(reverse(LIST), {"ordering": "book__owner__password"})) == default


@pytest.mark.django_db
def test_list_filters(auth_client, dataset, october, event_book, expense_cat, income_cat, method):
    d = dataset

    def ids(**params):
        return set(_ids(auth_client.get(reverse(LIST), params)))

    assert ids(book_id=str(event_book.id)) == {d["d"]["id"]}
    assert ids(type="INCOME") == {d["c"]["id"]}
    assert ids(type="EXPENSE") == {d["a"]["id"], d["b"]["id"], d["d"]["id"]}
    assert ids(category_id=str(expense_cat.id)) == {d["a"]["id"]}
    assert ids(payment_method_id=str(method.id)) == {d["a"]["id"]}
    assert ids(date_from="2026-10-15") == {d["b"]["id"], d["c"]["id"], d["d"]["id"]}
    assert ids(date_to="2026-10-15") == {d["a"]["id"], d["b"]["id"]}
    assert ids(date_from="2026-10-15", date_to="2026-10-20") == {d["b"]["id"], d["c"]["id"]}
    assert ids(search="coffee") == {d["a"]["id"], d["d"]["id"]}


@pytest.mark.django_db
def test_list_filters_combine_with_and(auth_client, dataset, october):
    d = dataset
    resp = auth_client.get(
        reverse(LIST), {"book_id": str(october.id), "type": "EXPENSE", "search": "coffee", "date_to": "2026-10-31"}
    )
    assert _ids(resp) == [d["a"]["id"]]


@pytest.mark.django_db
def test_list_search_treats_wildcards_literally(auth_client, october):
    _make(auth_client, october, description="100% fun")
    _make(auth_client, october, description="plain")
    assert auth_client.get(reverse(LIST), {"search": "%"}).json()["count"] == 1
    assert auth_client.get(reverse(LIST), {"search": "_"}).json()["count"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "params",
    [
        {"type": "TRANSFER"},
        {"book_id": "nope"},
        {"category_id": "nope"},
        {"payment_method_id": "nope"},
        {"date_from": "2026-99-01"},
        {"date_to": "yesterday"},
    ],
)
def test_list_rejects_malformed_filters(auth_client, params):
    resp = auth_client.get(reverse(LIST), params)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_list_pagination_default_size_and_links(auth_client, october):
    for i in range(27):
        Transaction.objects.create(
            book=october, type="EXPENSE", amount=Decimal("1.00"), transaction_date=D(2026, 10, 1 + (i % 28))
        )
    page1 = auth_client.get(reverse(LIST)).json()
    assert page1["count"] == 27 and len(page1["results"]) == 25
    assert page1["previous"] is None and "page=2" in page1["next"]
    page2 = auth_client.get(reverse(LIST), {"page": 2}).json()
    assert len(page2["results"]) == 2 and page2["next"] is None and page2["previous"] is not None
    all_ids = [r["id"] for r in page1["results"]] + [r["id"] for r in page2["results"]]
    assert len(set(all_ids)) == 27  # deterministic, no overlap
    assert auth_client.get(reverse(LIST), {"page": 3}).status_code == 404


@pytest.mark.django_db
def test_list_pagination_is_stable_with_identical_sort_keys(auth_client, october):
    for _ in range(30):
        Transaction.objects.create(
            book=october, type="EXPENSE", amount=Decimal("5.00"), transaction_date=D(2026, 10, 1)
        )
    seen = []
    for page in (1, 2):
        seen += _ids(auth_client.get(reverse(LIST), {"page": page, "ordering": "amount"}))
    assert len(seen) == 30 and len(set(seen)) == 30


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_patch_updates_fields(auth_client, october, expense_cat, method):
    created = _make(auth_client, october)
    resp = _patch(
        auth_client,
        reverse(DETAIL, args=[created["id"]]),
        {
            "amount": "300.75",
            "description": "Changed",
            "transaction_date": "2026-10-03",
            "category_id": str(expense_cat.id),
            "payment_method_id": str(method.id),
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == "300.75" and data["description"] == "Changed"
    assert data["transaction_date"] == "2026-10-03"
    assert data["category"]["id"] == str(expense_cat.id)
    assert data["payment_method"]["id"] == str(method.id)
    assert data["id"] == created["id"] and data["created_at"] == created["created_at"]
    assert data["updated_at"] >= created["updated_at"]


@pytest.mark.django_db
def test_patch_empty_body_is_noop(auth_client, october):
    created = _make(auth_client, october)
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {})
    assert resp.status_code == 200
    assert resp.json()["amount"] == created["amount"]


@pytest.mark.django_db
@pytest.mark.parametrize("amount", ["0", "-1", "1.234", "abc", None])
def test_patch_rejects_invalid_amount(auth_client, october, amount):
    created = _make(auth_client, october)
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {"amount": amount})
    assert resp.status_code == 400
    _err(resp, "amount")
    assert Transaction.objects.get(pk=created["id"]).amount == Decimal("250.00")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "field, value", [("type", "TRANSFER"), ("type", None), ("book_id", None), ("transaction_date", None), ("transaction_date", "2026-02-30")]
)
def test_patch_rejects_invalid_or_null_required_fields(auth_client, october, field, value):
    created = _make(auth_client, october)
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {field: value})
    assert resp.status_code == 400
    _err(resp, field)


@pytest.mark.django_db
def test_patch_category_type_mismatch(auth_client, october, income_cat, expense_cat):
    created = _make(auth_client, october, category_id=str(expense_cat.id))
    url = reverse(DETAIL, args=[created["id"]])
    _err(_patch(auth_client, url, {"category_id": str(income_cat.id)}), "category_id")
    # Changing only the type conflicts with the existing category.
    _err(_patch(auth_client, url, {"type": "INCOME"}), "category_id")
    ok = _patch(auth_client, url, {"type": "INCOME", "category_id": str(income_cat.id)})
    assert ok.status_code == 200 and ok.json()["type"] == "INCOME"


@pytest.mark.django_db
def test_patch_rejects_newly_selected_inactive_references(auth_client, october, expense_cat, method):
    created = _make(auth_client, october)
    url = reverse(DETAIL, args=[created["id"]])
    expense_cat.is_active = method.is_active = False
    expense_cat.save()
    method.save()
    _err(_patch(auth_client, url, {"category_id": str(expense_cat.id)}), "category_id")
    _err(_patch(auth_client, url, {"payment_method_id": str(method.id)}), "payment_method_id")


@pytest.mark.django_db
def test_existing_inactive_references_remain_valid_on_update_and_read(auth_client, october, expense_cat, method):
    created = _make(auth_client, october, category_id=str(expense_cat.id), payment_method_id=str(method.id))
    url = reverse(DETAIL, args=[created["id"]])
    expense_cat.is_active = method.is_active = False
    expense_cat.save()
    method.save()
    # Still readable, listed and filterable.
    assert auth_client.get(url).json()["category"]["id"] == str(expense_cat.id)
    assert auth_client.get(reverse(LIST), {"category_id": str(expense_cat.id)}).json()["count"] == 1
    # Unrelated edit keeps them.
    resp = _patch(auth_client, url, {"amount": "11.00"})
    assert resp.status_code == 200 and resp.json()["category"]["id"] == str(expense_cat.id)
    # Re-sending the same inactive references is accepted too.
    resp = _patch(auth_client, url, {"category_id": str(expense_cat.id), "payment_method_id": str(method.id)})
    assert resp.status_code == 200
    # Clearing is allowed.
    resp = _patch(auth_client, url, {"category_id": None, "payment_method_id": None})
    assert resp.status_code == 200 and resp.json()["category"] is None
    # But once cleared, the inactive one cannot be re-selected.
    _err(_patch(auth_client, url, {"category_id": str(expense_cat.id)}), "category_id")


@pytest.mark.django_db
def test_patch_rejects_cross_user_references(auth_client, other_user, october):
    created = _make(auth_client, october)
    url = reverse(DETAIL, args=[created["id"]])
    their_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    their_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    their_pm = PaymentMethod.objects.create(owner=other_user, name="Cash")
    _err(_patch(auth_client, url, {"book_id": str(their_book.id)}), "book_id")
    _err(_patch(auth_client, url, {"category_id": str(their_cat.id)}), "category_id")
    _err(_patch(auth_client, url, {"payment_method_id": str(their_pm.id)}), "payment_method_id")
    row = Transaction.objects.get(pk=created["id"])
    assert row.book_id == october.id and row.category_id is None and row.payment_method_id is None


@pytest.mark.django_db
def test_patch_monthly_date_change_moves_to_matching_monthly_book(auth_client, user, october):
    created = _make(auth_client, october)
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {"transaction_date": "2026-11-05"})
    assert resp.status_code == 200
    november = Book.objects.get(owner=user, type=BookType.MONTHLY, year=2026, month=11)
    assert resp.json()["book_id"] == str(november.id)
    assert auth_client.get(reverse(LIST), {"book_id": str(october.id)}).json()["count"] == 0
    assert auth_client.get(reverse(LIST), {"book_id": str(november.id)}).json()["count"] == 1


@pytest.mark.django_db
def test_patch_event_book_date_change_preserves_book(auth_client, event_book):
    created = _make(auth_client, event_book)
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {"transaction_date": "2027-02-01"})
    assert resp.status_code == 200 and resp.json()["book_id"] == str(event_book.id)


@pytest.mark.django_db
def test_patch_in_archived_book_rejected(auth_client, event_book):
    created = _make(auth_client, event_book)
    event_book.is_archived = True
    event_book.save()
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {"amount": "1.00"})
    assert resp.status_code == 400
    assert Transaction.objects.get(pk=created["id"]).amount == Decimal("250.00")


@pytest.mark.django_db
def test_patch_move_to_archived_book_rejected(auth_client, october, event_book):
    created = _make(auth_client, october)
    event_book.is_archived = True
    event_book.save()
    resp = _patch(auth_client, reverse(DETAIL, args=[created["id"]]), {"book_id": str(event_book.id)})
    assert resp.status_code == 400
    _err(resp, "book_id")


@pytest.mark.django_db
def test_patch_ignores_client_supplied_server_fields(auth_client, october, other_user):
    created = _make(auth_client, october)
    resp = _patch(
        auth_client,
        reverse(DETAIL, args=[created["id"]]),
        {"id": str(uuid.uuid4()), "owner": str(other_user.id), "deleted_at": "2020-01-01T00:00:00Z", "amount": "2.00"},
    )
    assert resp.status_code == 200
    row = Transaction.all_objects.get(pk=created["id"])
    assert str(row.id) == created["id"] and row.deleted_at is None
    assert row.book.owner.email == "txapi@example.com"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_delete_is_soft_and_hides_from_standard_views(auth_client, october):
    created = _make(auth_client, october)
    url = reverse(DETAIL, args=[created["id"]])
    resp = auth_client.delete(url)
    assert resp.status_code == 204 and resp.content == b""
    row = Transaction.all_objects.get(pk=created["id"])
    assert row.deleted_at is not None
    assert auth_client.get(url).status_code == 404
    assert _ids(auth_client.get(reverse(LIST))) == []
    assert auth_client.get(reverse(LIST), {"include_deleted": "true"}).json()["count"] == 0


@pytest.mark.django_db
def test_deleted_transaction_cannot_be_modified(auth_client, october):
    created = _make(auth_client, october)
    url = reverse(DETAIL, args=[created["id"]])
    auth_client.delete(url)
    resp = _patch(auth_client, url, {"amount": "1.00"})
    assert resp.status_code == 404
    assert Transaction.all_objects.get(pk=created["id"]).amount == Decimal("250.00")


@pytest.mark.django_db
def test_repeated_delete_is_idempotent_204(auth_client, october):
    created = _make(auth_client, october)
    url = reverse(DETAIL, args=[created["id"]])
    assert auth_client.delete(url).status_code == 204
    first = Transaction.all_objects.get(pk=created["id"]).deleted_at
    assert auth_client.delete(url).status_code == 204
    assert Transaction.all_objects.get(pk=created["id"]).deleted_at == first


@pytest.mark.django_db
def test_delete_unknown_id_404(auth_client):
    assert auth_client.delete(reverse(DETAIL, args=[uuid.uuid4()])).status_code == 404


@pytest.mark.django_db
def test_delete_in_archived_book_rejected(auth_client, event_book):
    created = _make(auth_client, event_book)
    event_book.is_archived = True
    event_book.save()
    assert auth_client.delete(reverse(DETAIL, args=[created["id"]])).status_code == 400
    assert Transaction.objects.filter(pk=created["id"]).exists()


@pytest.mark.django_db
def test_delete_preserves_row_and_references(auth_client, october, expense_cat):
    created = _make(auth_client, october, category_id=str(expense_cat.id))
    auth_client.delete(reverse(DETAIL, args=[created["id"]]))
    row = Transaction.all_objects.get(pk=created["id"])
    assert row.category_id == expense_cat.id and row.amount == Decimal("250.00")


@pytest.mark.django_db
def test_unsupported_methods(auth_client, october):
    created = _make(auth_client, october)
    assert auth_client.put(reverse(DETAIL, args=[created["id"]])).status_code == 405
    assert auth_client.delete(reverse(LIST)).status_code == 405
