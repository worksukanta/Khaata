"""
API integration tests for budgets and allocations (BE-006):
GET/POST /api/v1/budgets/, GET/PATCH /api/v1/budgets/{id}/,
PUT /api/v1/budgets/{id}/allocations/.
"""
import datetime
import json
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from khaata.apps.books.models import BookType
from khaata.apps.books.services import create_book, ensure_monthly_book
from khaata.apps.budgets.models import Budget
from khaata.apps.transactions.models import Category
from khaata.apps.transactions.services import create_transaction, soft_delete_transaction

User = get_user_model()

LIST = "budget-list-create"
DETAIL = "budget-detail"
ALLOC = "budget-allocations"
D = datetime.date


def _post(client, url, payload, **extra):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **extra)


def _patch(client, url, payload, **extra):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **extra)


def _put(client, url, payload, **extra):
    return client.put(url, data=json.dumps(payload), content_type="application/json", **extra)


@pytest.fixture
def user():
    return User.objects.create_user(email="bapi1@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="bapi2@example.com", password="SecurePassword123!")


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


def _monthly_body(**overrides):
    body = {"scope": "MONTHLY_OVERALL", "year": 2026, "month": 10, "total_limit": "20000.00"}
    body.update(overrides)
    return body


def _make(client, body=None):
    resp = _post(client, reverse(LIST), body or _monthly_body())
    assert resp.status_code == 201, resp.content
    return resp.json()


def _err(resp, field):
    body = resp.json()
    assert resp.status_code == 400, body
    assert body["error"]["code"] == "validation_error"
    assert field in body["error"]["details"], body
    return body["error"]["details"][field]


def _spend(user, book, amount, date, category=None, txn_type="EXPENSE"):
    data = {"book_id": book.id, "type": txn_type, "amount": Decimal(amount), "transaction_date": date}
    if category is not None:
        data["category_id"] = category.id
    return create_transaction(user, data)


# ---------------------------------------------------------------------------
# Authentication & CSRF
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_endpoints_require_authentication(client):
    bid = uuid.uuid4()
    assert client.get(reverse(LIST)).status_code == 401
    assert _post(client, reverse(LIST), {}).status_code in (401, 403)
    assert client.get(reverse(DETAIL, args=[bid])).status_code == 401
    assert _patch(client, reverse(DETAIL, args=[bid]), {}).status_code in (401, 403)
    assert _put(client, reverse(ALLOC, args=[bid]), {"allocations": []}).status_code in (401, 403)


@pytest.mark.django_db
def test_state_changing_requests_enforce_csrf(csrf_client, food):
    token = _csrf_token(csrf_client)
    url = reverse(LIST)
    assert _post(csrf_client, url, _monthly_body()).status_code == 403
    created = _post(csrf_client, url, _monthly_body(), HTTP_X_CSRFTOKEN=token)
    assert created.status_code == 201
    budget_id = created.json()["id"]
    detail = reverse(DETAIL, args=[budget_id])
    assert _patch(csrf_client, detail, {"total_limit": "1.00"}).status_code == 403
    assert _patch(csrf_client, detail, {"total_limit": "1.00"}, HTTP_X_CSRFTOKEN=token).status_code == 200
    alloc = reverse(ALLOC, args=[budget_id])
    body = {"allocations": [{"category_id": str(food.id), "amount": "1.00"}]}
    assert _put(csrf_client, alloc, body).status_code == 403
    assert _put(csrf_client, alloc, body, HTTP_X_CSRFTOKEN=token).status_code == 200
    assert Budget.objects.get(pk=budget_id).allocations.count() == 1


@pytest.mark.django_db
def test_get_does_not_require_csrf(csrf_client):
    assert csrf_client.get(reverse(LIST)).status_code == 200


@pytest.mark.django_db
def test_unsupported_methods(auth_client):
    budget = _make(auth_client)
    detail = reverse(DETAIL, args=[budget["id"]])
    assert auth_client.delete(detail).status_code == 405
    assert auth_client.put(detail).status_code == 405
    assert auth_client.get(reverse(ALLOC, args=[budget["id"]])).status_code == 405
    assert _post(auth_client, reverse(ALLOC, args=[budget["id"]]), {}).status_code == 405


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_monthly_response_shape(auth_client, user):
    data = _make(auth_client)
    assert set(data) == {
        "id", "scope", "book_id", "year", "month", "total_limit", "created_at", "updated_at",
        "allocations", "allocated_total", "unallocated", "unallocated_spent",
        "uncategorised_spent", "spent", "remaining", "utilization_percent", "status",
    }
    assert data["scope"] == "MONTHLY_OVERALL"
    assert data["book_id"] is None
    assert (data["year"], data["month"]) == (2026, 10)
    assert data["total_limit"] == "20000.00"
    assert data["allocations"] == []
    assert data["allocated_total"] == "0.00" and data["unallocated"] == "20000.00"
    assert data["spent"] == "0.00" and data["remaining"] == "20000.00"
    assert data["utilization_percent"] == "0.00" and data["status"] == "ON_TRACK"
    assert Budget.objects.get(pk=data["id"]).owner == user


@pytest.mark.django_db
def test_create_event_budget(auth_client, event_book):
    data = _make(auth_client, {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "10000"})
    assert data["scope"] == "EVENT"
    assert data["book_id"] == str(event_book.id)
    assert data["year"] is None and data["month"] is None
    assert data["total_limit"] == "10000.00"


@pytest.mark.django_db
def test_create_zero_limit(auth_client):
    data = _make(auth_client, _monthly_body(total_limit="0.00"))
    assert data["total_limit"] == "0.00" and data["status"] == "ON_TRACK"


@pytest.mark.django_db
@pytest.mark.parametrize("missing", ["scope", "total_limit"])
def test_create_required_fields(auth_client, missing):
    body = _monthly_body()
    del body[missing]
    _err(_post(auth_client, reverse(LIST), body), missing)


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["year", "month"])
def test_monthly_requires_year_and_month(auth_client, field):
    body = _monthly_body()
    del body[field]
    _err(_post(auth_client, reverse(LIST), body), field)


@pytest.mark.django_db
def test_event_requires_book_id(auth_client):
    _err(_post(auth_client, reverse(LIST), {"scope": "EVENT", "total_limit": "1.00"}), "book_id")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "limit",
    ["-0.01", "-1", "10.001", "0.001", "abc", "", None, "1e3x", "1000000000000.00", "NaN", "Infinity"],
)
def test_create_rejects_invalid_limits(auth_client, limit):
    _err(_post(auth_client, reverse(LIST), _monthly_body(total_limit=limit)), "total_limit")
    assert Budget.objects.count() == 0


@pytest.mark.django_db
def test_create_accepts_json_number_without_float_error(auth_client):
    resp = _post(auth_client, reverse(LIST), _monthly_body(total_limit=0.1))
    assert resp.status_code == 201
    assert resp.json()["total_limit"] == "0.10"


@pytest.mark.django_db
def test_create_rejects_invalid_scope(auth_client):
    _err(_post(auth_client, reverse(LIST), _monthly_body(scope="WEEKLY")), "scope")


@pytest.mark.django_db
@pytest.mark.parametrize("year,month", [(1999, 10), (2201, 10), (2026, 0), (2026, 13), ("x", 10)])
def test_create_rejects_invalid_period(auth_client, year, month):
    resp = _post(auth_client, reverse(LIST), _monthly_body(year=year, month=month))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_duplicate_monthly_returns_400(auth_client):
    _make(auth_client)
    resp = _post(auth_client, reverse(LIST), _monthly_body(total_limit="1.00"))
    _err(resp, "month")
    assert Budget.objects.count() == 1


@pytest.mark.django_db
def test_duplicate_event_returns_400(auth_client, event_book):
    body = {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "1.00"}
    _make(auth_client, body)
    _err(_post(auth_client, reverse(LIST), body), "book_id")


@pytest.mark.django_db
def test_event_budget_rejects_non_event_book(auth_client, user):
    general = create_book(user, {"type": BookType.GENERAL, "name": "Misc"})
    monthly_book = ensure_monthly_book(user, 2026, 10)[0]
    for book in (general, monthly_book):
        resp = _post(
            auth_client,
            reverse(LIST),
            {"scope": "EVENT", "book_id": str(book.id), "total_limit": "1.00"},
        )
        _err(resp, "book_id")


@pytest.mark.django_db
def test_cross_user_book_reference_rejected_without_disclosure(auth_client, other_user):
    theirs = create_book(other_user, {"type": BookType.EVENT, "name": "Theirs"})
    foreign = _post(
        auth_client, reverse(LIST), {"scope": "EVENT", "book_id": str(theirs.id), "total_limit": "1.00"}
    )
    unknown = _post(
        auth_client, reverse(LIST), {"scope": "EVENT", "book_id": str(uuid.uuid4()), "total_limit": "1.00"}
    )
    assert _err(foreign, "book_id") == _err(unknown, "book_id")
    assert Budget.objects.count() == 0


@pytest.mark.django_db
def test_client_cannot_set_owner(auth_client, user, other_user):
    data = _make(auth_client, _monthly_body(owner=str(other_user.id), owner_id=str(other_user.id)))
    assert Budget.objects.get(pk=data["id"]).owner == user


# ---------------------------------------------------------------------------
# List & retrieve
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_list_is_paginated_and_user_scoped(auth_client, other_user):
    _make(auth_client)
    Budget.objects.create(owner=other_user, scope="MONTHLY_OVERALL", year=2026, month=10, total_limit=1)
    data = auth_client.get(reverse(LIST)).json()
    assert set(data) == {"count", "next", "previous", "results"}
    assert data["count"] == 1
    assert data["results"][0]["scope"] == "MONTHLY_OVERALL"


@pytest.mark.django_db
def test_list_filters_and_deterministic_order(auth_client, event_book):
    _make(auth_client, _monthly_body(month=9))
    _make(auth_client, _monthly_body(month=10))
    _make(auth_client, _monthly_body(year=2025, month=12))
    _make(auth_client, {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "5.00"})
    url = reverse(LIST)

    def ids_months(query=""):
        return [(r["scope"], r["year"], r["month"]) for r in auth_client.get(url + query).json()["results"]]

    assert ids_months("?scope=EVENT") == [("EVENT", None, None)]
    assert ids_months("?scope=MONTHLY_OVERALL&year=2026") == [
        ("MONTHLY_OVERALL", 2026, 10),
        ("MONTHLY_OVERALL", 2026, 9),
    ]
    assert ids_months("?year=2026&month=9") == [("MONTHLY_OVERALL", 2026, 9)]
    assert [r["book_id"] for r in auth_client.get(url + f"?book_id={event_book.id}").json()["results"]] == [
        str(event_book.id)
    ]
    assert auth_client.get(url + f"?book_id={uuid.uuid4()}").json()["count"] == 0
    # Newest period first; the budgets without a period (event) sort last.
    all_rows = ids_months()
    assert all_rows[:3] == [
        ("MONTHLY_OVERALL", 2026, 10),
        ("MONTHLY_OVERALL", 2026, 9),
        ("MONTHLY_OVERALL", 2025, 12),
    ]
    assert len(all_rows) == 4


@pytest.mark.django_db
@pytest.mark.parametrize(
    "query",
    [
        "?scope=BOGUS",
        "?month=13",
        "?month=0",
        "?year=abc",
        "?year=99999999999999999999",
        "?year=-5",
        "?year=0",
        "?book_id=not-a-uuid",
    ],
)
def test_list_rejects_malformed_filters(auth_client, query):
    resp = auth_client.get(reverse(LIST) + query)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_list_pagination_page_size(auth_client):
    for month in range(1, 13):
        _make(auth_client, _monthly_body(month=month))
    for year in (2027, 2028):
        for month in range(1, 13):
            _make(auth_client, _monthly_body(year=year, month=month))
    first = auth_client.get(reverse(LIST)).json()
    assert first["count"] == 36 and len(first["results"]) == 25 and first["next"]
    second = auth_client.get(reverse(LIST) + "?page=2").json()
    assert len(second["results"]) == 11
    ids = [r["id"] for r in first["results"]] + [r["id"] for r in second["results"]]
    assert len(set(ids)) == 36


@pytest.mark.django_db
def test_retrieve_budget(auth_client):
    budget = _make(auth_client)
    resp = auth_client.get(reverse(DETAIL, args=[budget["id"]]))
    assert resp.status_code == 200
    assert resp.json()["id"] == budget["id"]


@pytest.mark.django_db
def test_retrieve_unknown_and_cross_user_are_identical_404(auth_client, other_user):
    theirs = Budget.objects.create(owner=other_user, scope="MONTHLY_OVERALL", year=2026, month=10, total_limit=1)
    foreign = auth_client.get(reverse(DETAIL, args=[theirs.id]))
    unknown = auth_client.get(reverse(DETAIL, args=[uuid.uuid4()]))
    assert foreign.status_code == unknown.status_code == 404
    assert foreign.json()["error"]["code"] == unknown.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_patch_total_limit(auth_client):
    budget = _make(auth_client)
    resp = _patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"total_limit": "30000.50"})
    assert resp.status_code == 200
    assert resp.json()["total_limit"] == "30000.50"
    assert Budget.objects.get(pk=budget["id"]).total_limit == 30000.50


@pytest.mark.django_db
def test_patch_period(auth_client):
    budget = _make(auth_client)
    resp = _patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"year": 2027, "month": 1})
    assert resp.status_code == 200
    assert (resp.json()["year"], resp.json()["month"]) == (2027, 1)


@pytest.mark.django_db
def test_patch_period_conflict(auth_client):
    _make(auth_client, _monthly_body(month=11))
    budget = _make(auth_client)
    _err(_patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"month": 11}), "month")


@pytest.mark.django_db
@pytest.mark.parametrize("limit", ["-1.00", "1.234", "abc", None, ""])
def test_patch_rejects_invalid_limit(auth_client, limit):
    budget = _make(auth_client)
    _err(_patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"total_limit": limit}), "total_limit")
    assert Budget.objects.get(pk=budget["id"]).total_limit == 20000


@pytest.mark.django_db
def test_patch_scope_and_book_immutable(auth_client, event_book, user):
    budget = _make(auth_client)
    _err(_patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"scope": "EVENT"}), "scope")
    event = _make(auth_client, {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "1.00"})
    other = create_book(user, {"type": BookType.EVENT, "name": "Other"})
    _err(_patch(auth_client, reverse(DETAIL, args=[event["id"]]), {"book_id": str(other.id)}), "book_id")


@pytest.mark.django_db
def test_patch_cross_user_and_unknown_404(auth_client, other_user):
    theirs = Budget.objects.create(owner=other_user, scope="MONTHLY_OVERALL", year=2026, month=10, total_limit=1)
    assert _patch(auth_client, reverse(DETAIL, args=[theirs.id]), {"total_limit": "5.00"}).status_code == 404
    assert _patch(auth_client, reverse(DETAIL, args=[uuid.uuid4()]), {"total_limit": "5.00"}).status_code == 404
    theirs.refresh_from_db()
    assert theirs.total_limit == 1


@pytest.mark.django_db
def test_patch_reduced_limit_reports_over_budget(auth_client, user):
    budget = _make(auth_client)
    book = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, book, "500.00", D(2026, 10, 5))
    resp = _patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"total_limit": "400.00"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["spent"] == "500.00" and body["remaining"] == "-100.00"
    assert body["utilization_percent"] == "125.00" and body["status"] == "OVER_BUDGET"


@pytest.mark.django_db
def test_patch_limit_below_allocated_total_rejected(auth_client, food):
    budget = _make(auth_client, _monthly_body(total_limit="1000.00"))
    assert _put(
        auth_client,
        reverse(ALLOC, args=[budget["id"]]),
        {"allocations": [{"category_id": str(food.id), "amount": "800.00"}]},
    ).status_code == 200
    _err(_patch(auth_client, reverse(DETAIL, args=[budget["id"]]), {"total_limit": "799.99"}), "total_limit")


# ---------------------------------------------------------------------------
# Allocations
# ---------------------------------------------------------------------------
def _alloc_body(*pairs):
    return {"allocations": [{"category_id": str(c.id), "amount": a} for c, a in pairs]}


@pytest.mark.django_db
def test_put_allocations_response(auth_client, user, food, travel):
    budget = _make(auth_client)
    book = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, book, "1200.00", D(2026, 10, 5), food)
    _spend(user, book, "100.00", D(2026, 10, 6), travel)
    _spend(user, book, "50.00", D(2026, 10, 7), None)
    resp = _put(
        auth_client,
        reverse(ALLOC, args=[budget["id"]]),
        _alloc_body((food, "5000.00"), (travel, "1500.00")),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["allocated_total"] == "6500.00"
    assert body["unallocated"] == "13500.00"
    assert body["spent"] == "1350.00" and body["uncategorised_spent"] == "50.00"
    assert body["unallocated_spent"] == "50.00"
    by_name = {a["category"]["name"]: a for a in body["allocations"]}
    assert [a["category"]["name"] for a in body["allocations"]] == ["Food", "Travel"]
    assert by_name["Food"]["amount"] == "5000.00" and by_name["Food"]["spent"] == "1200.00"
    assert by_name["Food"]["remaining"] == "3800.00" and by_name["Food"]["utilization_percent"] == "24.00"
    assert by_name["Food"]["status"] == "ON_TRACK"
    assert by_name["Food"]["category"] == {
        "id": str(food.id), "name": "Food", "type": "EXPENSE", "is_active": True,
    }
    assert by_name["Travel"]["utilization_percent"] == "6.67"


@pytest.mark.django_db
def test_put_is_full_replacement_and_persisted(auth_client, food, travel):
    budget = _make(auth_client)
    url = reverse(ALLOC, args=[budget["id"]])
    assert _put(auth_client, url, _alloc_body((food, "10.00"), (travel, "20.00"))).status_code == 200
    resp = _put(auth_client, url, _alloc_body((travel, "5.00")))
    assert [a["category"]["name"] for a in resp.json()["allocations"]] == ["Travel"]
    fetched = auth_client.get(reverse(DETAIL, args=[budget["id"]])).json()
    assert [a["amount"] for a in fetched["allocations"]] == ["5.00"]


@pytest.mark.django_db
def test_put_empty_list_clears(auth_client, food):
    budget = _make(auth_client)
    url = reverse(ALLOC, args=[budget["id"]])
    _put(auth_client, url, _alloc_body((food, "10.00")))
    resp = _put(auth_client, url, {"allocations": []})
    assert resp.status_code == 200 and resp.json()["allocations"] == []


@pytest.mark.django_db
def test_put_requires_allocations_key(auth_client):
    budget = _make(auth_client)
    _err(_put(auth_client, reverse(ALLOC, args=[budget["id"]]), {}), "allocations")


@pytest.mark.django_db
@pytest.mark.parametrize("amount", ["-0.01", "1.001", "abc", None, "", "1000000000000.00"])
def test_put_rejects_invalid_amounts(auth_client, food, amount):
    budget = _make(auth_client)
    resp = _put(auth_client, reverse(ALLOC, args=[budget["id"]]), _alloc_body((food, amount)))
    errors = _err(resp, "allocations")
    assert "amount" in errors["0"]
    assert Budget.objects.get(pk=budget["id"]).allocations.count() == 0


@pytest.mark.django_db
def test_put_missing_item_fields(auth_client, food):
    budget = _make(auth_client)
    url = reverse(ALLOC, args=[budget["id"]])
    assert "amount" in _err(_put(auth_client, url, {"allocations": [{"category_id": str(food.id)}]}), "allocations")["0"]
    assert "category_id" in _err(_put(auth_client, url, {"allocations": [{"amount": "1.00"}]}), "allocations")["0"]


@pytest.mark.django_db
def test_put_sum_exceeding_limit_rejected_and_rolled_back(auth_client, food, travel):
    budget = _make(auth_client, _monthly_body(total_limit="100.00"))
    url = reverse(ALLOC, args=[budget["id"]])
    assert _put(auth_client, url, _alloc_body((food, "40.00"))).status_code == 200
    resp = _put(auth_client, url, _alloc_body((food, "60.00"), (travel, "40.01")))
    _err(resp, "allocations")
    kept = Budget.objects.get(pk=budget["id"]).allocations.values_list("category_id", "amount")
    assert [(c, float(a)) for c, a in kept] == [(food.id, 40.0)]


@pytest.mark.django_db
def test_put_sum_equal_to_limit_accepted(auth_client, food, travel):
    budget = _make(auth_client, _monthly_body(total_limit="100.00"))
    resp = _put(auth_client, reverse(ALLOC, args=[budget["id"]]), _alloc_body((food, "60.00"), (travel, "40.00")))
    assert resp.status_code == 200 and resp.json()["unallocated"] == "0.00"


@pytest.mark.django_db
def test_put_zero_limit_budget(auth_client, food):
    budget = _make(auth_client, _monthly_body(total_limit="0.00"))
    url = reverse(ALLOC, args=[budget["id"]])
    _err(_put(auth_client, url, _alloc_body((food, "0.01"))), "allocations")
    assert _put(auth_client, url, _alloc_body((food, "0.00"))).status_code == 200


@pytest.mark.django_db
def test_put_duplicate_category_rejected(auth_client, food):
    budget = _make(auth_client)
    resp = _put(auth_client, reverse(ALLOC, args=[budget["id"]]), _alloc_body((food, "1.00"), (food, "2.00")))
    errors = _err(resp, "allocations")
    assert list(errors) == ["1"] and "category_id" in errors["1"]


@pytest.mark.django_db
def test_put_income_inactive_foreign_unknown_categories(auth_client, user, other_user, food, salary):
    budget = _make(auth_client)
    url = reverse(ALLOC, args=[budget["id"]])
    inactive = Category.objects.create(owner=user, name="Old", type="EXPENSE", is_active=False)
    theirs = Category.objects.create(owner=other_user, name="Theirs", type="EXPENSE")

    def category_error(category_id):
        body = {"allocations": [{"category_id": str(category_id), "amount": "1.00"}]}
        return _err(_put(auth_client, url, body), "allocations")["0"]["category_id"]

    assert "expense" in category_error(salary.id)[0].lower()
    assert "inactive" in category_error(inactive.id)[0].lower()
    assert category_error(theirs.id) == category_error(uuid.uuid4()) == ["Category not found."]
    assert Budget.objects.get(pk=budget["id"]).allocations.count() == 0


@pytest.mark.django_db
def test_put_cross_user_budget_404_and_untouched(auth_client, other_user, food):
    theirs = Budget.objects.create(owner=other_user, scope="MONTHLY_OVERALL", year=2026, month=10, total_limit=100)
    resp = _put(auth_client, reverse(ALLOC, args=[theirs.id]), _alloc_body((food, "1.00")))
    assert resp.status_code == 404
    assert theirs.allocations.count() == 0
    assert _put(auth_client, reverse(ALLOC, args=[uuid.uuid4()]), {"allocations": []}).status_code == 404


@pytest.mark.django_db
def test_put_allocations_on_event_budget(auth_client, user, event_book, food):
    budget = _make(auth_client, {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "1000.00"})
    _spend(user, event_book, "300.00", D(2026, 10, 5), food)
    resp = _put(auth_client, reverse(ALLOC, args=[budget["id"]]), _alloc_body((food, "250.00")))
    assert resp.status_code == 200
    allocation = resp.json()["allocations"][0]
    assert allocation["spent"] == "300.00" and allocation["remaining"] == "-50.00"
    assert allocation["status"] == "OVER_BUDGET" and allocation["utilization_percent"] == "120.00"


# ---------------------------------------------------------------------------
# Derived figures via the API
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_utilization_reflects_transactions_live(auth_client, user, food, salary):
    budget = _make(auth_client, _monthly_body(total_limit="1000.00"))
    detail = reverse(DETAIL, args=[budget["id"]])
    book = ensure_monthly_book(user, 2026, 10)[0]

    _spend(user, book, "99999.00", D(2026, 10, 1), salary, txn_type="INCOME")
    assert auth_client.get(detail).json()["spent"] == "0.00"

    kept = _spend(user, book, "800.00", D(2026, 10, 2), food)
    body = auth_client.get(detail).json()
    assert (body["spent"], body["utilization_percent"], body["status"]) == ("800.00", "80.00", "NEAR_LIMIT")

    extra = _spend(user, book, "300.00", D(2026, 10, 3), food)
    body = auth_client.get(detail).json()
    assert (body["remaining"], body["status"]) == ("-100.00", "OVER_BUDGET")

    soft_delete_transaction(user, extra.id)
    body = auth_client.get(detail).json()
    assert body["spent"] == "800.00" and body["status"] == "NEAR_LIMIT"
    assert kept.pk


@pytest.mark.django_db
def test_zero_limit_with_spending_is_unbudgeted(auth_client, user):
    budget = _make(auth_client, _monthly_body(total_limit="0.00"))
    book = ensure_monthly_book(user, 2026, 10)[0]
    detail = reverse(DETAIL, args=[budget["id"]])
    body = auth_client.get(detail).json()
    assert (body["utilization_percent"], body["status"]) == ("0.00", "ON_TRACK")
    _spend(user, book, "10.00", D(2026, 10, 5))
    body = auth_client.get(detail).json()
    assert body["utilization_percent"] is None and body["status"] == "UNBUDGETED_SPENDING"
    assert body["remaining"] == "-10.00"


@pytest.mark.django_db
def test_monthly_budget_includes_all_book_types_event_budget_only_its_book(auth_client, user, food, event_book):
    monthly = _make(auth_client)
    event = _make(auth_client, {"scope": "EVENT", "book_id": str(event_book.id), "total_limit": "1000.00"})
    general = create_book(user, {"type": BookType.GENERAL, "name": "Misc"})
    october = ensure_monthly_book(user, 2026, 10)[0]
    _spend(user, october, "100.00", D(2026, 10, 5), food)
    _spend(user, event_book, "200.00", D(2026, 10, 6), food)
    _spend(user, general, "300.00", D(2026, 10, 7), food)
    _spend(user, event_book, "400.00", D(2026, 11, 2), food)  # event spans into November
    monthly_body = auth_client.get(reverse(DETAIL, args=[monthly["id"]])).json()
    event_body = auth_client.get(reverse(DETAIL, args=[event["id"]])).json()
    assert monthly_body["spent"] == "600.00"
    assert event_body["spent"] == "600.00"  # 200 + 400, event book only


@pytest.mark.django_db
def test_other_users_spending_not_visible(auth_client, other_user):
    budget = _make(auth_client)
    category = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    book = ensure_monthly_book(other_user, 2026, 10)[0]
    _spend(other_user, book, "999.00", D(2026, 10, 5), category)
    assert auth_client.get(reverse(DETAIL, args=[budget["id"]])).json()["spent"] == "0.00"


@pytest.mark.django_db
def test_overspending_transaction_accepted_through_api(auth_client, user):
    _make(auth_client, _monthly_body(total_limit="10.00"))
    book = ensure_monthly_book(user, 2026, 10)[0]
    resp = _post(
        auth_client,
        reverse("transaction-list-create"),
        {"book_id": str(book.id), "type": "EXPENSE", "amount": "5000.00", "transaction_date": "2026-10-05"},
    )
    assert resp.status_code == 201


@pytest.mark.django_db
def test_deactivated_category_keeps_existing_allocation_visible(auth_client, food):
    budget = _make(auth_client)
    _put(auth_client, reverse(ALLOC, args=[budget["id"]]), _alloc_body((food, "100.00")))
    food.is_active = False
    food.save()
    body = auth_client.get(reverse(DETAIL, args=[budget["id"]])).json()
    assert body["allocations"][0]["category"]["is_active"] is False


@pytest.mark.django_db
def test_error_responses_do_not_leak_internals(auth_client):
    budget = _make(auth_client)
    resp = _post(auth_client, reverse(LIST), _monthly_body())
    text = resp.content.decode().lower()
    for leaked in ("traceback", "integrityerror", "unique constraint", "sqlite", "budgets_budget"):
        assert leaked not in text
    assert budget["id"] not in text
