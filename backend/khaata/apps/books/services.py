"""
Service functions for Book operations.

Encapsulates multi-step financial operations, business rules, lifecycle
transitions, and atomic operations with concurrency protection.
"""
import calendar
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from khaata.apps.books.models import Book, BookType


def ensure_monthly_book(user, year: int, month: int) -> tuple[Book, bool]:
    """
    Idempotently retrieve or create the monthly book for a user and calendar month.

    Returns:
        tuple[Book, bool]: (book, created)
            created is True if a new book was created, False if existing returned.

    Raises:
        ValidationError: if year or month are out of valid range.
    """
    if not isinstance(year, int) or not (2000 <= year <= 2200):
        raise ValidationError({"year": ["Year must be an integer between 2000 and 2200."]})
    if not isinstance(month, int) or not (1 <= month <= 12):
        raise ValidationError({"month": ["Month must be an integer between 1 and 12."]})

    # Fast path: check if book already exists
    book = Book.objects.filter(
        owner=user,
        type=BookType.MONTHLY,
        year=year,
        month=month,
    ).first()
    if book is not None:
        return book, False

    month_name = calendar.month_name[month]
    name = f"{month_name} {year}"

    try:
        with transaction.atomic():
            book = Book.objects.create(
                owner=user,
                type=BookType.MONTHLY,
                name=name,
                description="",
                year=year,
                month=month,
                opening_balance=Decimal("0.00"),
                is_archived=False,
            )
            return book, True
    except IntegrityError as exc:
        # A concurrent request created the book simultaneously; recover by
        # fetching the now-existing row.  If the row is unexpectedly absent
        # the original IntegrityError is re-raised so callers see the real
        # failure rather than a misleading DoesNotExist.
        try:
            book = Book.objects.get(
                owner=user,
                type=BookType.MONTHLY,
                year=year,
                month=month,
            )
        except Book.DoesNotExist:
            raise exc
        return book, False


def create_book(user, data: dict) -> Book:
    """
    Create an EVENT or GENERAL book.

    Monthly books must be created via ensure_monthly_book.
    """
    book_type = data.get("type")
    if book_type not in [BookType.EVENT, BookType.GENERAL]:
        raise ValidationError(
            {"type": ["Only EVENT and GENERAL books can be created directly. Monthly books must use the monthly ensure endpoint."]}
        )

    start_date = data.get("start_date")
    end_date = data.get("end_date")
    if start_date and end_date and end_date < start_date:
        raise ValidationError({"end_date": ["End date cannot be earlier than start date."]})

    name = data.get("name", "").strip()
    if not name:
        raise ValidationError({"name": ["This field may not be blank."]})

    book = Book.objects.create(
        owner=user,
        type=book_type,
        name=name,
        description=data.get("description", ""),
        start_date=start_date,
        end_date=end_date,
        opening_balance=data.get("opening_balance", Decimal("0.00")),
        year=None,
        month=None,
        is_archived=False,
    )
    return book


def update_book(book: Book, data: dict) -> Book:
    """
    Update editable metadata on an existing book.

    Business rules:
    - Archived books cannot be edited.
    - Monthly books are immutable (cannot edit type, year, month, name, dates).
    - Event/General books can update name, description, start_date, end_date.
    - Book type cannot be changed.
    """
    if book.is_archived:
        raise ValidationError({"detail": ["Archived books cannot be edited."]})

    if book.type == BookType.MONTHLY:
        raise ValidationError({"detail": ["Monthly books cannot be edited directly."]})

    if "type" in data and data["type"] != book.type:
        raise ValidationError({"type": ["Book type cannot be changed."]})

    if "year" in data and data["year"] is not None:
        raise ValidationError({"year": ["Year cannot be set on event or general books."]})

    if "month" in data and data["month"] is not None:
        raise ValidationError({"month": ["Month cannot be set on event or general books."]})

    start_date = data.get("start_date", book.start_date)
    end_date = data.get("end_date", book.end_date)
    if start_date and end_date and end_date < start_date:
        raise ValidationError({"end_date": ["End date cannot be earlier than start date."]})

    if "name" in data:
        name = data["name"].strip()
        if not name:
            raise ValidationError({"name": ["This field may not be blank."]})
        book.name = name

    if "description" in data:
        book.description = data["description"]

    if "start_date" in data:
        book.start_date = data["start_date"]

    if "end_date" in data:
        book.end_date = data["end_date"]

    book.save()
    return book


def archive_book(book: Book) -> Book:
    """
    Archive an EVENT or GENERAL book.

    Monthly books cannot be archived in V1.
    """
    if book.type == BookType.MONTHLY:
        raise ValidationError({"detail": ["Monthly books cannot be archived."]})

    if not book.is_archived:
        book.is_archived = True
        book.save(update_fields=["is_archived", "updated_at"])
    return book


def restore_book(book: Book) -> Book:
    """
    Restore an archived EVENT or GENERAL book.

    Monthly books cannot be archived or restored.
    """
    if book.type == BookType.MONTHLY:
        raise ValidationError({"detail": ["Monthly books cannot be archived or restored."]})

    if book.is_archived:
        book.is_archived = False
        book.save(update_fields=["is_archived", "updated_at"])
    return book
