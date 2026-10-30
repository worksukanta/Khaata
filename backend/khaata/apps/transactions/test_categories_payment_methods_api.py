"""
API integration tests for categories and payment methods:
- GET/POST /api/v1/categories/, PATCH /api/v1/categories/{id}/
- GET/POST /api/v1/payment-methods/, PATCH /api/v1/payment-methods/{id}/
- Registration seeding, authentication, CSRF, ownership, validation, lifecycle.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from khaata.apps.transactions.models import Category, PaymentMethod
from khaata.apps.transactions.services import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    DEFAULT_PAYMENT_METHODS,
    seed_user_defaults,
)

User = get_user_model()

CAT_LIST = "category-list-create"
CAT_DETAIL = "category-detail"
PM_LIST = "payment-method-list-create"
PM_DETAIL = "payment-method-detail"


def _post(client, url, payload, **extra):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **extra)


def _patch(client, url, payload, **extra):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **extra)


@pytest.fixture
def user():
    return User.objects.create_user(email="catuser@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="catother@example.com", password="SecurePassword123!")


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


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
@pytest.mark.django_db
@pytest.mark.parametrize("name", [CAT_LIST, PM_LIST])
def test_list_and_create_require_authentication(client, name):
    assert client.get(reverse(name)).status_code == 401
    resp = _post(client, reverse(name), {"name": "X", "type": "EXPENSE"})
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
@pytest.mark.parametrize("name", [CAT_DETAIL, PM_DETAIL])
def test_patch_requires_authentication(client, name):
    resp = _patch(client, reverse(name, args=[uuid.uuid4()]), {"name": "X"})
    assert resp.status_code in (401, 403)
    if resp.status_code == 401:
        assert resp.json()["error"]["code"] == "not_authenticated"


# ---------------------------------------------------------------------------
# Registration seeding
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_registration_seeds_defaults(client):
    resp = _post(
        client,
        reverse("auth-register"),
        {"email": "seeded@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 201
    new_user = User.objects.get(email="seeded@example.com")
    assert Category.objects.filter(owner=new_user).count() == (
        len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)
    )
    assert set(PaymentMethod.objects.filter(owner=new_user).values_list("name", flat=True)) == set(
        DEFAULT_PAYMENT_METHODS
    )
    # Login and see them via API.
    client.force_login(new_user)
    assert client.get(reverse(CAT_LIST) + "?page_size=100").json()["count"] == (
        len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)
    )
    assert client.get(reverse(PM_LIST)).json()["count"] == 6


@pytest.mark.django_db
def test_failed_registration_creates_no_defaults(client):
    User.objects.create_user(email="dup@example.com", password="StrongPassword123!")
    before_c, before_p = Category.objects.count(), PaymentMethod.objects.count()
    resp = _post(
        client,
        reverse("auth-register"),
        {"email": "dup@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 400
    assert Category.objects.count() == before_c
    assert PaymentMethod.objects.count() == before_p


@pytest.mark.django_db
def test_registration_rolls_back_user_when_seeding_fails(client, monkeypatch):
    def boom(_user):
        raise RuntimeError("seed failure")

    monkeypatch.setattr("khaata.apps.accounts.serializers.seed_user_defaults", boom)
    c = Client(raise_request_exception=False)
    resp = _post(
        c,
        reverse("auth-register"),
        {"email": "rollback@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 500
    assert not User.objects.filter(email="rollback@example.com").exists()


# ---------------------------------------------------------------------------
# Categories: list / filter / order / pagination
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_list_categories_scoped_to_owner(auth_client, user, other_user):
    Category.objects.create(owner=user, name="Mine", type="EXPENSE")
    Category.objects.create(owner=other_user, name="Theirs", type="EXPENSE")
    data = auth_client.get(reverse(CAT_LIST)).json()
    assert data["count"] == 1
    assert data["results"][0]["name"] == "Mine"


@pytest.mark.django_db
def test_category_response_shape_and_no_owner_leak(auth_client, user):
    Category.objects.create(owner=user, name="Mine", type="EXPENSE")
    item = auth_client.get(reverse(CAT_LIST)).json()["results"][0]
    assert set(item) == {"id", "name", "type", "is_default", "is_active", "created_at", "updated_at"}


@pytest.mark.django_db
def test_list_categories_filters_and_ordering(auth_client, user):
    Category.objects.create(owner=user, name="Zebra", type="EXPENSE")
    Category.objects.create(owner=user, name="Apple", type="EXPENSE", is_active=False)
    Category.objects.create(owner=user, name="Salary", type="INCOME")
    url = reverse(CAT_LIST)

    names = [r["name"] for r in auth_client.get(url).json()["results"]]
    # ordered by type (EXPENSE < INCOME) then name
    assert names == ["Apple", "Zebra", "Salary"]

    assert [r["name"] for r in auth_client.get(url + "?type=INCOME").json()["results"]] == ["Salary"]
    assert [r["name"] for r in auth_client.get(url + "?type=income").json()["results"]] == ["Salary"]
    assert auth_client.get(url + "?type=BOGUS").json()["count"] == 0
    assert [r["name"] for r in auth_client.get(url + "?is_active=false").json()["results"]] == ["Apple"]
    assert auth_client.get(url + "?is_active=true").json()["count"] == 2
    assert [r["name"] for r in auth_client.get(url + "?search=ZEB").json()["results"]] == ["Zebra"]
    assert [
        r["name"] for r in auth_client.get(url + "?type=EXPENSE&is_active=true&search=e").json()["results"]
    ] == ["Zebra"]


@pytest.mark.django_db
def test_list_categories_is_paginated(auth_client, user):
    for i in range(30):
        Category.objects.create(owner=user, name=f"Cat {i:02d}", type="EXPENSE")
    data = auth_client.get(reverse(CAT_LIST)).json()
    assert data["count"] == 30
    assert len(data["results"]) == 25
    assert data["next"] is not None
    page2 = auth_client.get(reverse(CAT_LIST) + "?page=2").json()
    assert len(page2["results"]) == 5


# ---------------------------------------------------------------------------
# Categories: create
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_category_success_assigns_owner(auth_client, user):
    resp = _post(auth_client, reverse(CAT_LIST), {"name": "Coffee", "type": "EXPENSE"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Coffee" and body["type"] == "EXPENSE"
    assert body["is_active"] is True and body["is_default"] is False
    assert Category.objects.get(id=body["id"]).owner == user


@pytest.mark.django_db
def test_create_category_ignores_client_owner_and_flags(auth_client, user, other_user):
    resp = _post(
        auth_client,
        reverse(CAT_LIST),
        {
            "name": "Sneaky",
            "type": "INCOME",
            "owner": str(other_user.id),
            "owner_id": str(other_user.id),
            "is_default": True,
            "id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 201
    created = Category.objects.get(name="Sneaky")
    assert created.owner == user
    assert created.is_default is False
    assert str(created.id) == resp.json()["id"]


@pytest.mark.django_db
def test_create_category_trims_whitespace(auth_client):
    resp = _post(auth_client, reverse(CAT_LIST), {"name": "  Coffee  ", "type": "EXPENSE"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Coffee"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload,field",
    [
        ({"type": "EXPENSE"}, "name"),
        ({"name": "X"}, "type"),
        ({"name": "", "type": "EXPENSE"}, "name"),
        ({"name": "   ", "type": "EXPENSE"}, "name"),
        ({"name": "X", "type": "TRANSFER"}, "type"),
        ({"name": "x" * 81, "type": "EXPENSE"}, "name"),
    ],
)
def test_create_category_validation_errors(auth_client, payload, field):
    resp = _post(auth_client, reverse(CAT_LIST), payload)
    assert resp.status_code == 400
    err = resp.json()["error"]
    assert err["code"] == "validation_error"
    assert field in err["details"]


@pytest.mark.django_db
def test_create_category_max_length_boundary(auth_client):
    assert _post(auth_client, reverse(CAT_LIST), {"name": "x" * 80, "type": "EXPENSE"}).status_code == 201


@pytest.mark.django_db
def test_create_category_duplicate_case_insensitive_same_type(auth_client, user):
    Category.objects.create(owner=user, name="Coffee", type="EXPENSE")
    resp = _post(auth_client, reverse(CAT_LIST), {"name": "cOFfee", "type": "EXPENSE"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"
    assert "name" in resp.json()["error"]["details"]
    assert Category.objects.filter(owner=user).count() == 1


@pytest.mark.django_db
def test_create_category_same_name_other_type_or_user_allowed(auth_client, user, other_user):
    Category.objects.create(owner=user, name="Gift", type="EXPENSE")
    Category.objects.create(owner=other_user, name="Gift", type="INCOME")
    assert _post(auth_client, reverse(CAT_LIST), {"name": "Gift", "type": "INCOME"}).status_code == 201


# ---------------------------------------------------------------------------
# Categories: update / lifecycle
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_patch_category_rename_and_deactivate_and_reactivate(auth_client, user):
    c = Category.objects.create(owner=user, name="Old", type="EXPENSE", is_default=True)
    url = reverse(CAT_DETAIL, args=[c.id])
    resp = _patch(auth_client, url, {"name": "New"})
    assert resp.status_code == 200 and resp.json()["name"] == "New"
    resp = _patch(auth_client, url, {"is_active": False})
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert resp.json()["name"] == "New"
    resp = _patch(auth_client, url, {"is_active": True})
    assert resp.json()["is_active"] is True
    c.refresh_from_db()
    assert c.is_default is True  # default flag preserved on edits


@pytest.mark.django_db
def test_patch_category_empty_body_is_noop(auth_client, user):
    c = Category.objects.create(owner=user, name="Same", type="EXPENSE")
    resp = _patch(auth_client, reverse(CAT_DETAIL, args=[c.id]), {})
    assert resp.status_code == 200 and resp.json()["name"] == "Same"


@pytest.mark.django_db
def test_patch_category_type_change_rejected(auth_client, user):
    c = Category.objects.create(owner=user, name="Fixed", type="EXPENSE")
    url = reverse(CAT_DETAIL, args=[c.id])
    resp = _patch(auth_client, url, {"type": "INCOME"})
    assert resp.status_code == 400
    assert "type" in resp.json()["error"]["details"]
    # Same type value is a harmless no-op.
    assert _patch(auth_client, url, {"type": "EXPENSE"}).status_code == 200
    c.refresh_from_db()
    assert c.type == "EXPENSE"


@pytest.mark.django_db
def test_patch_category_ignores_owner_and_is_default(auth_client, user, other_user):
    c = Category.objects.create(owner=user, name="Mine", type="EXPENSE")
    resp = _patch(
        auth_client,
        reverse(CAT_DETAIL, args=[c.id]),
        {"owner": str(other_user.id), "is_default": True, "name": "Renamed"},
    )
    assert resp.status_code == 200
    c.refresh_from_db()
    assert c.owner == user and c.is_default is False and c.name == "Renamed"


@pytest.mark.django_db
def test_patch_category_duplicate_name_rejected(auth_client, user):
    Category.objects.create(owner=user, name="Coffee", type="EXPENSE")
    tea = Category.objects.create(owner=user, name="Tea", type="EXPENSE")
    resp = _patch(auth_client, reverse(CAT_DETAIL, args=[tea.id]), {"name": "COFFEE"})
    assert resp.status_code == 400
    assert "name" in resp.json()["error"]["details"]


@pytest.mark.django_db
@pytest.mark.parametrize("payload", [{"name": ""}, {"name": "  "}, {"name": "x" * 81}, {"is_active": "maybe"}])
def test_patch_category_validation_errors(auth_client, user, payload):
    c = Category.objects.create(owner=user, name="Mine", type="EXPENSE")
    resp = _patch(auth_client, reverse(CAT_DETAIL, args=[c.id]), payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_patch_category_cross_user_and_missing_return_404(auth_client, other_user):
    theirs = Category.objects.create(owner=other_user, name="Theirs", type="EXPENSE")
    resp = _patch(auth_client, reverse(CAT_DETAIL, args=[theirs.id]), {"name": "Hacked"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"
    theirs.refresh_from_db()
    assert theirs.name == "Theirs"
    assert _patch(auth_client, reverse(CAT_DETAIL, args=[uuid.uuid4()]), {"name": "x"}).status_code == 404


@pytest.mark.django_db
def test_category_delete_and_get_detail_not_supported(auth_client, user):
    c = Category.objects.create(owner=user, name="Mine", type="EXPENSE")
    url = reverse(CAT_DETAIL, args=[c.id])
    assert auth_client.delete(url).status_code == 405
    assert auth_client.get(url).status_code == 405
    assert auth_client.put(url, data="{}", content_type="application/json").status_code == 405
    assert Category.objects.filter(id=c.id).exists()


@pytest.mark.django_db
def test_deactivated_category_remains_listed_and_filterable(auth_client, user):
    c = Category.objects.create(owner=user, name="Retired", type="EXPENSE")
    _patch(auth_client, reverse(CAT_DETAIL, args=[c.id]), {"is_active": False})
    assert auth_client.get(reverse(CAT_LIST)).json()["count"] == 1
    assert auth_client.get(reverse(CAT_LIST) + "?is_active=true").json()["count"] == 0


# ---------------------------------------------------------------------------
# Payment methods
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_list_payment_methods_scoped_filtered_ordered(auth_client, user, other_user):
    PaymentMethod.objects.create(owner=user, name="UPI")
    PaymentMethod.objects.create(owner=user, name="Cash", is_active=False)
    PaymentMethod.objects.create(owner=other_user, name="Theirs")
    url = reverse(PM_LIST)
    data = auth_client.get(url).json()
    assert [r["name"] for r in data["results"]] == ["Cash", "UPI"]
    assert set(data["results"][0]) == {"id", "name", "is_active", "created_at", "updated_at"}
    assert [r["name"] for r in auth_client.get(url + "?is_active=false").json()["results"]] == ["Cash"]
    assert [r["name"] for r in auth_client.get(url + "?is_active=true").json()["results"]] == ["UPI"]
    assert [r["name"] for r in auth_client.get(url + "?search=up").json()["results"]] == ["UPI"]


@pytest.mark.django_db
def test_create_payment_method_assigns_owner(auth_client, user, other_user):
    resp = _post(auth_client, reverse(PM_LIST), {"name": "Wallet", "owner": str(other_user.id)})
    assert resp.status_code == 201
    assert PaymentMethod.objects.get(id=resp.json()["id"]).owner == user
    assert resp.json()["is_active"] is True


@pytest.mark.django_db
@pytest.mark.parametrize("payload", [{}, {"name": ""}, {"name": "  "}, {"name": "x" * 61}])
def test_create_payment_method_validation_errors(auth_client, payload):
    resp = _post(auth_client, reverse(PM_LIST), payload)
    assert resp.status_code == 400
    assert "name" in resp.json()["error"]["details"]


@pytest.mark.django_db
def test_create_payment_method_duplicate_case_insensitive(auth_client, user):
    PaymentMethod.objects.create(owner=user, name="Cash")
    resp = _post(auth_client, reverse(PM_LIST), {"name": "cash"})
    assert resp.status_code == 400
    assert "name" in resp.json()["error"]["details"]
    assert PaymentMethod.objects.filter(owner=user).count() == 1


@pytest.mark.django_db
def test_create_payment_method_same_name_other_user_allowed(auth_client, other_user):
    PaymentMethod.objects.create(owner=other_user, name="Cash")
    assert _post(auth_client, reverse(PM_LIST), {"name": "Cash"}).status_code == 201


@pytest.mark.django_db
def test_patch_payment_method_lifecycle(auth_client, user):
    pm = PaymentMethod.objects.create(owner=user, name="Wallet")
    url = reverse(PM_DETAIL, args=[pm.id])
    assert _patch(auth_client, url, {"name": "E-Wallet"}).json()["name"] == "E-Wallet"
    assert _patch(auth_client, url, {"is_active": False}).json()["is_active"] is False
    assert _patch(auth_client, url, {"is_active": True}).json()["is_active"] is True
    assert _patch(auth_client, url, {}).status_code == 200


@pytest.mark.django_db
def test_patch_payment_method_duplicate_and_invalid(auth_client, user):
    PaymentMethod.objects.create(owner=user, name="Cash")
    pm = PaymentMethod.objects.create(owner=user, name="Wallet")
    url = reverse(PM_DETAIL, args=[pm.id])
    assert _patch(auth_client, url, {"name": "CASH"}).status_code == 400
    assert _patch(auth_client, url, {"name": ""}).status_code == 400
    assert _patch(auth_client, url, {"name": "x" * 61}).status_code == 400


@pytest.mark.django_db
def test_patch_payment_method_cross_user_404(auth_client, other_user):
    theirs = PaymentMethod.objects.create(owner=other_user, name="Theirs")
    resp = _patch(auth_client, reverse(PM_DETAIL, args=[theirs.id]), {"name": "Hacked"})
    assert resp.status_code == 404
    theirs.refresh_from_db()
    assert theirs.name == "Theirs"


@pytest.mark.django_db
def test_payment_method_delete_and_get_detail_not_supported(auth_client, user):
    pm = PaymentMethod.objects.create(owner=user, name="Wallet")
    url = reverse(PM_DETAIL, args=[pm.id])
    assert auth_client.delete(url).status_code == 405
    assert auth_client.get(url).status_code == 405
    assert PaymentMethod.objects.filter(id=pm.id).exists()


# ---------------------------------------------------------------------------
# CSRF enforcement on state-changing endpoints
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_category_create_and_patch_enforce_csrf(csrf_client, user):
    token = _csrf_token(csrf_client)
    url = reverse(CAT_LIST)

    assert _post(csrf_client, url, {"name": "A", "type": "EXPENSE"}).status_code == 403
    assert not Category.objects.filter(owner=user, name="A").exists()
    ok = _post(csrf_client, url, {"name": "A", "type": "EXPENSE"}, HTTP_X_CSRFTOKEN=token)
    assert ok.status_code == 201

    detail = reverse(CAT_DETAIL, args=[ok.json()["id"]])
    assert _patch(csrf_client, detail, {"name": "B"}).status_code == 403
    assert Category.objects.get(id=ok.json()["id"]).name == "A"
    assert _patch(csrf_client, detail, {"name": "B"}, HTTP_X_CSRFTOKEN=token).status_code == 200


@pytest.mark.django_db
def test_payment_method_create_and_patch_enforce_csrf(csrf_client, user):
    token = _csrf_token(csrf_client)
    url = reverse(PM_LIST)

    assert _post(csrf_client, url, {"name": "A"}).status_code == 403
    ok = _post(csrf_client, url, {"name": "A"}, HTTP_X_CSRFTOKEN=token)
    assert ok.status_code == 201

    detail = reverse(PM_DETAIL, args=[ok.json()["id"]])
    assert _patch(csrf_client, detail, {"name": "B"}).status_code == 403
    assert PaymentMethod.objects.get(id=ok.json()["id"]).name == "A"
    assert _patch(csrf_client, detail, {"name": "B"}, HTTP_X_CSRFTOKEN=token).status_code == 200


@pytest.mark.django_db
def test_get_endpoints_do_not_require_csrf(csrf_client):
    assert csrf_client.get(reverse(CAT_LIST)).status_code == 200
    assert csrf_client.get(reverse(PM_LIST)).status_code == 200


# ---------------------------------------------------------------------------
# Regression: existing endpoints unaffected
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_books_and_auth_endpoints_still_work(auth_client):
    assert auth_client.get(reverse("book-list-create")).status_code == 200
    assert auth_client.get(reverse("auth-me")).status_code == 200
    assert auth_client.get("/api/v1/health/").status_code == 200


@pytest.mark.django_db
def test_seeded_user_isolated_from_other_seeded_user(client, user, other_user):
    seed_user_defaults(user)
    seed_user_defaults(other_user)
    client.force_login(user)
    ids = {r["id"] for r in client.get(reverse(PM_LIST)).json()["results"]}
    assert ids == {str(p.id) for p in PaymentMethod.objects.filter(owner=user)}
    assert not ids & {str(p.id) for p in PaymentMethod.objects.filter(owner=other_user)}
