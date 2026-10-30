"""
Comprehensive API integration tests for Books endpoints:
- GET /api/v1/books/ (list, pagination, filtering, search, ordering)
- POST /api/v1/books/ (create EVENT and GENERAL books, reject MONTHLY)
- POST /api/v1/books/monthly/{year}/{month}/ensure/ (idempotent ensure, 201/200, isolation)
- GET /api/v1/books/{id}/ (detail, ownership enforcement, 404 on cross-user)
- PATCH /api/v1/books/{id}/ (partial update, immutable monthly, archived protection)
- POST /api/v1/books/{id}/archive/ (archive EVENT/GENERAL, reject MONTHLY)
- POST /api/v1/books/{id}/restore/ (restore EVENT/GENERAL, reject MONTHLY)
- Error envelopes and status codes compliance
"""
import json
import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
import pytest

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import ensure_monthly_book

User = get_user_model()


@pytest.fixture
def auth_user():
    return User.objects.create_user(
        email="bookuser@example.com",
        password="SecurePassword123!",
        display_name="Book User",
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="otherbookuser@example.com",
        password="SecurePassword123!",
        display_name="Other Book User",
    )


@pytest.fixture
def auth_client(client, auth_user):
    client.force_login(auth_user)
    return client


@pytest.fixture
def other_client(other_user):
    from django.test import Client
    c = Client()
    c.force_login(other_user)
    return c


# ---------------------------------------------------------------------------
# 1. GET /api/v1/books/ (List, Filter, Search, Order, Pagination)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_list_books_unauthenticated_returns_401(client):
    url = reverse("book-list-create")
    response = client.get(url)
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_list_books_empty_for_new_user(auth_client):
    url = reverse("book-list-create")
    response = auth_client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 0
    assert data["results"] == []


@pytest.mark.django_db
def test_list_books_scoped_to_authenticated_user(auth_client, auth_user, other_user):
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="User1 Event")
    Book.objects.create(owner=other_user, type=BookType.EVENT, name="User2 Event")

    url = reverse("book-list-create")
    response = auth_client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["results"][0]["name"] == "User1 Event"


@pytest.mark.django_db
def test_list_books_filter_by_type(auth_client, auth_user):
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Event Book")
    Book.objects.create(owner=auth_user, type=BookType.GENERAL, name="General Book")
    Book.objects.create(owner=auth_user, type=BookType.MONTHLY, name="October 2026", year=2026, month=10)

    url = reverse("book-list-create")

    # Filter EVENT
    resp = auth_client.get(f"{url}?type=EVENT")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["type"] == "EVENT"

    # Filter GENERAL
    resp = auth_client.get(f"{url}?type=GENERAL")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["type"] == "GENERAL"

    # Filter MONTHLY
    resp = auth_client.get(f"{url}?type=MONTHLY")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["type"] == "MONTHLY"

    # Filter invalid type returns empty
    resp = auth_client.get(f"{url}?type=UNKNOWN")
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


@pytest.mark.django_db
def test_list_books_filter_by_is_archived(auth_client, auth_user):
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Active Event", is_archived=False)
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Archived Event", is_archived=True)

    url = reverse("book-list-create")

    resp_active = auth_client.get(f"{url}?is_archived=false")
    assert resp_active.json()["count"] == 1
    assert resp_active.json()["results"][0]["name"] == "Active Event"

    resp_archived = auth_client.get(f"{url}?is_archived=true")
    assert resp_archived.json()["count"] == 1
    assert resp_archived.json()["results"][0]["name"] == "Archived Event"


@pytest.mark.django_db
def test_list_books_search_filter(auth_client, auth_user):
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Durga Puja 2026", description="Festival")
    Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Goa Vacation", description="Beach trip")

    url = reverse("book-list-create")

    # Search in name
    resp = auth_client.get(f"{url}?search=puja")
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["name"] == "Durga Puja 2026"

    # Search in description
    resp = auth_client.get(f"{url}?search=beach")
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["name"] == "Goa Vacation"


@pytest.mark.django_db
def test_list_books_ordering(auth_client, auth_user):
    b1 = Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Alpha")
    b2 = Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Beta")

    url = reverse("book-list-create")

    # Order by name asc
    resp = auth_client.get(f"{url}?ordering=name")
    assert resp.json()["results"][0]["name"] == "Alpha"
    assert resp.json()["results"][1]["name"] == "Beta"

    # Order by name desc
    resp = auth_client.get(f"{url}?ordering=-name")
    assert resp.json()["results"][0]["name"] == "Beta"
    assert resp.json()["results"][1]["name"] == "Alpha"


@pytest.mark.django_db
def test_list_books_pagination(auth_client, auth_user):
    for i in range(30):
        Book.objects.create(owner=auth_user, type=BookType.EVENT, name=f"Event {i:02d}")

    url = reverse("book-list-create")
    response = auth_client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 30
    assert len(data["results"]) == 25
    assert data["next"] is not None
    assert data["previous"] is None

    # Page 2
    page2_resp = auth_client.get(data["next"])
    assert page2_resp.status_code == 200
    page2_data = page2_resp.json()
    assert len(page2_data["results"]) == 5
    assert page2_data["next"] is None
    assert page2_data["previous"] is not None


# ---------------------------------------------------------------------------
# 2. POST /api/v1/books/ (Create Event/General Books)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_event_book_success(auth_client, auth_user):
    url = reverse("book-list-create")
    payload = {
        "type": "EVENT",
        "name": "Durga Puja 2026",
        "description": "Puja expenses",
        "start_date": "2026-10-16",
        "end_date": "2026-10-21",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "EVENT"
    assert data["name"] == "Durga Puja 2026"
    assert data["description"] == "Puja expenses"
    assert data["start_date"] == "2026-10-16"
    assert data["end_date"] == "2026-10-21"
    assert data["opening_balance"] == "0.00"
    assert data["is_archived"] is False
    assert data["year"] is None
    assert data["month"] is None
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.django_db
def test_create_general_book_success(auth_client, auth_user):
    url = reverse("book-list-create")
    payload = {
        "type": "GENERAL",
        "name": "Household Expenses",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "GENERAL"
    assert data["name"] == "Household Expenses"
    assert data["description"] == ""
    assert data["start_date"] is None
    assert data["end_date"] is None


@pytest.mark.django_db
def test_create_book_rejects_monthly_type(auth_client):
    url = reverse("book-list-create")
    payload = {
        "type": "MONTHLY",
        "name": "October 2026",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "type" in data["error"]["details"]


@pytest.mark.django_db
def test_create_book_missing_name_fails(auth_client):
    url = reverse("book-list-create")
    payload = {
        "type": "EVENT",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "name" in data["error"]["details"]


@pytest.mark.django_db
def test_create_book_blank_name_fails(auth_client):
    url = reverse("book-list-create")
    payload = {
        "type": "EVENT",
        "name": "   ",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "name" in data["error"]["details"]


@pytest.mark.django_db
def test_create_book_invalid_date_range_fails(auth_client):
    url = reverse("book-list-create")
    payload = {
        "type": "EVENT",
        "name": "Trip",
        "start_date": "2026-10-20",
        "end_date": "2026-10-10",
    }
    response = auth_client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "end_date" in data["error"]["details"]


# ---------------------------------------------------------------------------
# 3. POST /api/v1/books/monthly/{year}/{month}/ensure/ (Ensure Monthly Book)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_ensure_monthly_book_unauthenticated_returns_401(client):
    url = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 10})
    response = client.post(url)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_ensure_monthly_book_creates_new_returns_201(auth_client, auth_user):
    url = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 10})
    response = auth_client.post(url)
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "MONTHLY"
    assert data["name"] == "October 2026"
    assert data["year"] == 2026
    assert data["month"] == 10
    assert data["opening_balance"] == "0.00"
    assert data["is_archived"] is False
    assert Book.objects.filter(owner=auth_user, type=BookType.MONTHLY, year=2026, month=10).count() == 1


@pytest.mark.django_db
def test_ensure_monthly_book_repeated_returns_200_and_same_id(auth_client, auth_user):
    url = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 10})
    resp1 = auth_client.post(url)
    assert resp1.status_code == 201
    book_id = resp1.json()["id"]

    resp2 = auth_client.post(url)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == book_id
    assert Book.objects.filter(owner=auth_user, type=BookType.MONTHLY, year=2026, month=10).count() == 1


@pytest.mark.django_db
def test_ensure_monthly_book_different_months_create_separate_books(auth_client, auth_user):
    url_oct = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 10})
    url_nov = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 11})

    resp_oct = auth_client.post(url_oct)
    resp_nov = auth_client.post(url_nov)

    assert resp_oct.status_code == 201
    assert resp_nov.status_code == 201
    assert resp_oct.json()["id"] != resp_nov.json()["id"]
    assert resp_oct.json()["name"] == "October 2026"
    assert resp_nov.json()["name"] == "November 2026"
    assert Book.objects.filter(owner=auth_user, type=BookType.MONTHLY).count() == 2


@pytest.mark.django_db
def test_ensure_monthly_book_user_isolation(auth_client, other_client, auth_user, other_user):
    url = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 10})

    resp1 = auth_client.post(url)
    resp2 = other_client.post(url)

    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["id"] != resp2.json()["id"]
    assert Book.objects.filter(type=BookType.MONTHLY, year=2026, month=10).count() == 2


@pytest.mark.django_db
def test_ensure_monthly_book_invalid_year_fails(auth_client):
    url_low = reverse("book-monthly-ensure", kwargs={"year": 1999, "month": 10})
    response = auth_client.post(url_low)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "year" in response.json()["error"]["details"]

    url_high = reverse("book-monthly-ensure", kwargs={"year": 2201, "month": 10})
    response = auth_client.post(url_high)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "year" in response.json()["error"]["details"]


@pytest.mark.django_db
def test_ensure_monthly_book_invalid_month_fails(auth_client):
    url_zero = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 0})
    response = auth_client.post(url_zero)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "month" in response.json()["error"]["details"]

    url_thirteen = reverse("book-monthly-ensure", kwargs={"year": 2026, "month": 13})
    response = auth_client.post(url_thirteen)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "month" in response.json()["error"]["details"]


# ---------------------------------------------------------------------------
# 4. GET /api/v1/books/{id}/ (Detail View & Ownership)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_get_book_detail_success(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Durga Puja 2026",
        description="Puja expenses",
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    response = auth_client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(book.id)
    assert data["name"] == "Durga Puja 2026"
    assert data["description"] == "Puja expenses"


@pytest.mark.django_db
def test_get_book_detail_cross_user_returns_404(auth_client, other_user):
    book = Book.objects.create(
        owner=other_user,
        type=BookType.EVENT,
        name="Other User Event",
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    response = auth_client.get(url)
    assert response.status_code == 404
    data = response.json()
    assert data["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_get_book_detail_nonexistent_returns_404(auth_client):
    url = reverse("book-detail", kwargs={"id": uuid.uuid4()})
    response = auth_client.get(url)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# 5. PATCH /api/v1/books/{id}/ (Update Metadata)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_patch_event_book_success(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Original Event",
        description="Old description",
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    payload = {
        "name": "Updated Event",
        "description": "New description",
        "start_date": "2026-10-15",
        "end_date": "2026-10-20",
    }
    response = auth_client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Event"
    assert data["description"] == "New description"
    assert data["start_date"] == "2026-10-15"
    assert data["end_date"] == "2026-10-20"


@pytest.mark.django_db
def test_patch_monthly_book_rejected(auth_client, auth_user):
    monthly, _ = ensure_monthly_book(auth_user, 2026, 10)
    url = reverse("book-detail", kwargs={"id": monthly.id})
    payload = {"name": "New Monthly Name"}
    response = auth_client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_patch_archived_book_rejected(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Archived Event",
        is_archived=True,
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    payload = {"name": "New Name"}
    response = auth_client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_patch_book_invalid_dates_rejected(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Trip",
        start_date="2026-10-10",
        end_date="2026-10-20",
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    payload = {"end_date": "2026-10-05"}
    response = auth_client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "end_date" in data["error"]["details"]


@pytest.mark.django_db
def test_patch_cross_user_book_returns_404(auth_client, other_user):
    book = Book.objects.create(
        owner=other_user,
        type=BookType.EVENT,
        name="Other Event",
    )
    url = reverse("book-detail", kwargs={"id": book.id})
    payload = {"name": "Hijacked"}
    response = auth_client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# 6. POST /api/v1/books/{id}/archive/ & /restore/
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_archive_event_book_success(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Finished Event",
        is_archived=False,
    )
    url = reverse("book-archive", kwargs={"id": book.id})
    response = auth_client.post(url)
    assert response.status_code == 200
    data = response.json()
    assert data["is_archived"] is True
    book.refresh_from_db()
    assert book.is_archived is True


@pytest.mark.django_db
def test_restore_event_book_success(auth_client, auth_user):
    book = Book.objects.create(
        owner=auth_user,
        type=BookType.EVENT,
        name="Archived Event",
        is_archived=True,
    )
    url = reverse("book-restore", kwargs={"id": book.id})
    response = auth_client.post(url)
    assert response.status_code == 200
    data = response.json()
    assert data["is_archived"] is False
    book.refresh_from_db()
    assert book.is_archived is False


@pytest.mark.django_db
def test_archive_monthly_book_rejected(auth_client, auth_user):
    monthly, _ = ensure_monthly_book(auth_user, 2026, 10)
    url = reverse("book-archive", kwargs={"id": monthly.id})
    response = auth_client.post(url)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_restore_monthly_book_rejected(auth_client, auth_user):
    monthly, _ = ensure_monthly_book(auth_user, 2026, 10)
    url = reverse("book-restore", kwargs={"id": monthly.id})
    response = auth_client.post(url)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_archive_cross_user_book_returns_404(auth_client, other_user):
    book = Book.objects.create(
        owner=other_user,
        type=BookType.EVENT,
        name="Other Event",
    )
    url = reverse("book-archive", kwargs={"id": book.id})
    response = auth_client.post(url)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_restore_cross_user_book_returns_404(auth_client, other_user):
    book = Book.objects.create(
        owner=other_user,
        type=BookType.EVENT,
        name="Other Event",
        is_archived=True,
    )
    url = reverse("book-restore", kwargs={"id": book.id})
    response = auth_client.post(url)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# 7. Unauthenticated Mutation & Invalid UUID Endpoint Tests
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_book_unauthenticated_returns_401(client):
    url = reverse("book-list-create")
    response = client.post(url, data=json.dumps({"type": "EVENT", "name": "Trip"}), content_type="application/json")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_patch_book_unauthenticated_returns_401(client, auth_user):
    book = Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Event")
    url = reverse("book-detail", kwargs={"id": book.id})
    response = client.patch(url, data=json.dumps({"name": "New Name"}), content_type="application/json")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_archive_book_unauthenticated_returns_401(client, auth_user):
    book = Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Event")
    url = reverse("book-archive", kwargs={"id": book.id})
    response = client.post(url)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_restore_book_unauthenticated_returns_401(client, auth_user):
    book = Book.objects.create(owner=auth_user, type=BookType.EVENT, name="Event", is_archived=True)
    url = reverse("book-restore", kwargs={"id": book.id})
    response = client.post(url)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_invalid_uuid_detail_returns_404(auth_client):
    response = auth_client.get("/api/v1/books/invalid-uuid-123/")
    assert response.status_code == 404
