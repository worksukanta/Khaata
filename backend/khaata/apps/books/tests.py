"""
Unit tests for Book models, database constraints, and services.
"""
from decimal import Decimal
import threading
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
import pytest

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import (
    archive_book,
    create_book,
    ensure_monthly_book,
    restore_book,
    update_book,
)

User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="testuser@example.com",
        password="securepassword123",
        display_name="Test User",
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="otheruser@example.com",
        password="securepassword123",
        display_name="Other User",
    )


# ---------------------------------------------------------------------------
# Model & Basic Field Tests
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_monthly_book_model(user):
    book = Book.objects.create(
        owner=user,
        type=BookType.MONTHLY,
        name="October 2026",
        year=2026,
        month=10,
    )
    assert book.id is not None
    assert book.owner == user
    assert book.type == BookType.MONTHLY
    assert book.name == "October 2026"
    assert book.year == 2026
    assert book.month == 10
    assert book.opening_balance == Decimal("0.00")
    assert book.is_archived is False
    assert book.created_at is not None
    assert book.updated_at is not None
    assert str(book) == "October 2026 (Monthly)"


@pytest.mark.django_db
def test_create_event_book_model(user):
    book = Book.objects.create(
        owner=user,
        type=BookType.EVENT,
        name="Durga Puja 2026",
        description="Puja expenses",
        start_date="2026-10-16",
        end_date="2026-10-21",
    )
    assert book.type == BookType.EVENT
    assert book.year is None
    assert book.month is None
    assert str(book.start_date) == "2026-10-16"
    assert str(book.end_date) == "2026-10-21"
    assert str(book) == "Durga Puja 2026 (Event)"


@pytest.mark.django_db
def test_create_general_book_model(user):
    book = Book.objects.create(
        owner=user,
        type=BookType.GENERAL,
        name="Household Miscellaneous",
    )
    assert book.type == BookType.GENERAL
    assert book.year is None
    assert book.month is None
    assert str(book) == "Household Miscellaneous (General)"


# ---------------------------------------------------------------------------
# Database Constraints Tests
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_db_constraint_unique_monthly_book_per_user_year_month(user):
    Book.objects.create(
        owner=user,
        type=BookType.MONTHLY,
        name="October 2026",
        year=2026,
        month=10,
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.MONTHLY,
                name="Duplicate October 2026",
                year=2026,
                month=10,
            )


@pytest.mark.django_db
def test_db_constraint_different_users_can_have_same_monthly_book(user, other_user):
    book1 = Book.objects.create(
        owner=user,
        type=BookType.MONTHLY,
        name="October 2026",
        year=2026,
        month=10,
    )
    book2 = Book.objects.create(
        owner=other_user,
        type=BookType.MONTHLY,
        name="October 2026",
        year=2026,
        month=10,
    )
    assert book1.id != book2.id
    assert book1.year == book2.year == 2026
    assert book1.month == book2.month == 10


@pytest.mark.django_db
def test_db_constraint_multiple_event_books_allowed_for_same_user(user):
    b1 = Book.objects.create(
        owner=user,
        type=BookType.EVENT,
        name="Trip to Goa",
    )
    b2 = Book.objects.create(
        owner=user,
        type=BookType.EVENT,
        name="Trip to Goa Part 2",
    )
    assert b1.id != b2.id


@pytest.mark.django_db
def test_db_constraint_monthly_book_must_have_year_and_month(user):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.MONTHLY,
                name="Invalid Monthly",
                year=None,
                month=None,
            )


@pytest.mark.django_db
def test_db_constraint_monthly_book_invalid_month(user):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.MONTHLY,
                name="Invalid Month",
                year=2026,
                month=13,
            )


@pytest.mark.django_db
def test_db_constraint_event_book_cannot_have_year_or_month(user):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.EVENT,
                name="Invalid Event",
                year=2026,
                month=10,
            )


@pytest.mark.django_db
def test_db_constraint_end_date_gte_start_date(user):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.EVENT,
                name="Invalid Dates",
                start_date="2026-10-20",
                end_date="2026-10-10",
            )


@pytest.mark.django_db
def test_db_constraint_opening_balance_non_negative(user):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Book.objects.create(
                owner=user,
                type=BookType.GENERAL,
                name="Negative Balance",
                opening_balance=Decimal("-10.00"),
            )


# ---------------------------------------------------------------------------
# Service Layer Tests
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_service_ensure_monthly_book_creates_new(user):
    book, created = ensure_monthly_book(user, 2026, 10)
    assert created is True
    assert book.type == BookType.MONTHLY
    assert book.name == "October 2026"
    assert book.year == 2026
    assert book.month == 10
    assert book.owner == user


@pytest.mark.django_db
def test_service_ensure_monthly_book_idempotent(user):
    book1, created1 = ensure_monthly_book(user, 2026, 10)
    assert created1 is True

    book2, created2 = ensure_monthly_book(user, 2026, 10)
    assert created2 is False
    assert book1.id == book2.id


@pytest.mark.django_db
def test_service_ensure_monthly_book_invalid_year_month(user):
    with pytest.raises(ValidationError):
        ensure_monthly_book(user, 1999, 10)

    with pytest.raises(ValidationError):
        ensure_monthly_book(user, 2201, 10)

    with pytest.raises(ValidationError):
        ensure_monthly_book(user, 2026, 0)

    with pytest.raises(ValidationError):
        ensure_monthly_book(user, 2026, 13)


@pytest.mark.django_db
def test_service_ensure_monthly_book_handles_concurrent_race(user):
    # Pre-create the monthly book in the database
    existing_book = Book.objects.create(
        owner=user,
        type=BookType.MONTHLY,
        name="October 2026",
        year=2026,
        month=10,
    )

    # Simulate race condition: initial filter().first() misses (returns None),
    # so create() is called and raises IntegrityError due to concurrent commit.
    with patch.object(Book.objects, "filter") as mock_filter:
        mock_qs = mock_filter.return_value
        mock_qs.first.return_value = None

        with patch.object(Book.objects, "create", side_effect=IntegrityError("duplicate key")):
            book, created = ensure_monthly_book(user, 2026, 10)
            assert created is False
            assert book.id == existing_book.id
            assert book.year == 2026
            assert book.month == 10
            assert book.name == "October 2026"


@pytest.mark.django_db
def test_service_create_book_event_and_general(user):
    event = create_book(
        user,
        {
            "type": BookType.EVENT,
            "name": "Puja 2026",
            "description": "Puja ledger",
            "start_date": "2026-10-16",
            "end_date": "2026-10-21",
        },
    )
    assert event.type == BookType.EVENT
    assert event.name == "Puja 2026"
    assert event.year is None
    assert event.month is None

    general = create_book(
        user,
        {
            "type": BookType.GENERAL,
            "name": "General Expenses",
        },
    )
    assert general.type == BookType.GENERAL
    assert general.name == "General Expenses"


@pytest.mark.django_db
def test_service_create_book_rejects_monthly(user):
    with pytest.raises(ValidationError):
        create_book(user, {"type": BookType.MONTHLY, "name": "Direct Monthly"})


@pytest.mark.django_db
def test_service_create_book_validates_dates(user):
    with pytest.raises(ValidationError):
        create_book(
            user,
            {
                "type": BookType.EVENT,
                "name": "Trip",
                "start_date": "2026-10-20",
                "end_date": "2026-10-10",
            },
        )


@pytest.mark.django_db
def test_service_update_book(user):
    event = create_book(
        user,
        {
            "type": BookType.EVENT,
            "name": "Original Name",
            "description": "Desc",
        },
    )
    updated = update_book(
        event,
        {
            "name": "Updated Name",
            "description": "New Desc",
            "start_date": "2026-10-01",
            "end_date": "2026-10-05",
        },
    )
    assert updated.name == "Updated Name"
    assert updated.description == "New Desc"
    assert str(updated.start_date) == "2026-10-01"
    assert str(updated.end_date) == "2026-10-05"


@pytest.mark.django_db
def test_service_update_book_rejects_monthly(user):
    monthly, _ = ensure_monthly_book(user, 2026, 10)
    with pytest.raises(ValidationError):
        update_book(monthly, {"name": "New Name"})


@pytest.mark.django_db
def test_service_update_book_rejects_archived(user):
    event = create_book(user, {"type": BookType.EVENT, "name": "Event"})
    archive_book(event)
    with pytest.raises(ValidationError):
        update_book(event, {"name": "Changed Name"})


@pytest.mark.django_db
def test_service_update_book_rejects_invalid_dates(user):
    event = create_book(
        user,
        {
            "type": BookType.EVENT,
            "name": "Event",
            "start_date": "2026-10-10",
            "end_date": "2026-10-20",
        },
    )
    with pytest.raises(ValidationError):
        update_book(event, {"end_date": "2026-10-05"})


@pytest.mark.django_db
def test_service_archive_and_restore_book(user):
    event = create_book(user, {"type": BookType.EVENT, "name": "Event"})
    assert event.is_archived is False

    archived = archive_book(event)
    assert archived.is_archived is True

    restored = restore_book(archived)
    assert restored.is_archived is False


@pytest.mark.django_db
def test_service_archive_monthly_book_rejected(user):
    monthly, _ = ensure_monthly_book(user, 2026, 10)
    with pytest.raises(ValidationError):
        archive_book(monthly)


@pytest.mark.django_db
def test_service_restore_monthly_book_rejected(user):
    monthly, _ = ensure_monthly_book(user, 2026, 10)
    with pytest.raises(ValidationError):
        restore_book(monthly)
