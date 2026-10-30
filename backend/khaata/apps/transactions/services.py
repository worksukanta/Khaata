"""
Service functions for categories, payment methods and transactions.

Encapsulates default seeding and the write paths so that the case-insensitive
uniqueness rule (database constraint is authoritative) is translated into a
consistent validation error, and so that cross-table transaction rules
(ownership, category type, active references, book lifecycle) live in one place.
"""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import ensure_monthly_book
from khaata.apps.transactions.models import (
    Category,
    CategoryType,
    PaymentMethod,
    Transaction,
)

# BR-07 / API_CONTRACT section 4 require "sensible default categories" but no
# list is specified in the approved documents; this list is an implementation
# choice recorded in the BE-004 handoff notes.
DEFAULT_EXPENSE_CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Rent",
    "Utilities",
    "Shopping",
    "Health",
    "Entertainment",
    "Education",
    "Travel",
    "Other",
]
DEFAULT_INCOME_CATEGORIES = [
    "Salary",
    "Business",
    "Investments",
    "Gifts",
    "Other",
]
# API_CONTRACT section 4 / DATABASE_DESIGN PAYMENT_METHOD.
DEFAULT_PAYMENT_METHODS = [
    "Cash",
    "UPI",
    "Bank Transfer",
    "Debit Card",
    "Credit Card",
    "Other",
]

_DUPLICATE_CATEGORY_MESSAGE = "A category with this name and type already exists."
_DUPLICATE_PAYMENT_METHOD_MESSAGE = "A payment method with this name already exists."


def seed_user_defaults(user) -> None:
    """
    Idempotently seed default categories and payment methods for a user.

    Existing rows (matched case-insensitively) are left untouched, so calling
    this more than once never creates duplicates or overrides user edits.
    """
    with transaction.atomic():
        existing_categories = {
            (c.type, c.name.lower()) for c in Category.objects.filter(owner=user)
        }
        categories = [
            Category(owner=user, name=name, type=category_type.value, is_default=True)
            for category_type, names in (
                (CategoryType.EXPENSE, DEFAULT_EXPENSE_CATEGORIES),
                (CategoryType.INCOME, DEFAULT_INCOME_CATEGORIES),
            )
            for name in names
            if (category_type.value, name.lower()) not in existing_categories
        ]
        Category.objects.bulk_create(categories)

        existing_methods = {
            m.name.lower() for m in PaymentMethod.objects.filter(owner=user)
        }
        PaymentMethod.objects.bulk_create(
            [
                PaymentMethod(owner=user, name=name)
                for name in DEFAULT_PAYMENT_METHODS
                if name.lower() not in existing_methods
            ]
        )


def create_category(user, data: dict) -> Category:
    try:
        with transaction.atomic():
            return Category.objects.create(
                owner=user,
                name=data["name"],
                type=data["type"],
                is_default=False,
                is_active=data.get("is_active", True),
            )
    except IntegrityError:
        raise ValidationError({"name": [_DUPLICATE_CATEGORY_MESSAGE]})


def update_category(category: Category, data: dict) -> Category:
    """Update name and/or is_active only. Type and ownership are immutable."""
    if "name" in data:
        category.name = data["name"]
    if "is_active" in data:
        category.is_active = data["is_active"]
    try:
        with transaction.atomic():
            category.save()
    except IntegrityError:
        raise ValidationError({"name": [_DUPLICATE_CATEGORY_MESSAGE]})
    return category


def create_payment_method(user, data: dict) -> PaymentMethod:
    try:
        with transaction.atomic():
            return PaymentMethod.objects.create(
                owner=user,
                name=data["name"],
                is_active=data.get("is_active", True),
            )
    except IntegrityError:
        raise ValidationError({"name": [_DUPLICATE_PAYMENT_METHOD_MESSAGE]})


def update_payment_method(method: PaymentMethod, data: dict) -> PaymentMethod:
    """Update name and/or is_active only."""
    if "name" in data:
        method.name = data["name"]
    if "is_active" in data:
        method.is_active = data["is_active"]
    try:
        with transaction.atomic():
            method.save()
    except IntegrityError:
        raise ValidationError({"name": [_DUPLICATE_PAYMENT_METHOD_MESSAGE]})
    return method


# ---------------------------------------------------------------------------
# Transactions (BE-005)
# ---------------------------------------------------------------------------
_REF_NOT_FOUND = {
    "book_id": "Book not found.",
    "category_id": "Category not found.",
    "payment_method_id": "Payment method not found.",
}


def _get_owned_book(user, book_id, *, lock: bool = False) -> Book:
    """Return the user's book or raise a field error (never reveals other users' books)."""
    queryset = Book.objects.select_for_update() if lock else Book.objects
    try:
        return queryset.get(id=book_id, owner=user)
    except Book.DoesNotExist:
        raise ValidationError({"book_id": [_REF_NOT_FOUND["book_id"]]})


def _get_selectable_reference(model, field: str, user, ref_id):
    """Fetch an owned, *active* category/payment method for a new selection."""
    try:
        ref = model.objects.get(id=ref_id, owner=user)
    except model.DoesNotExist:
        raise ValidationError({field: [_REF_NOT_FOUND[field]]})
    if not ref.is_active:
        label = "Category" if field == "category_id" else "Payment method"
        raise ValidationError({field: [f"{label} is inactive and cannot be selected."]})
    return ref


def _validate_book_accepts_date(book: Book, txn_date) -> None:
    if book.type == BookType.MONTHLY and (book.year, book.month) != (txn_date.year, txn_date.month):
        raise ValidationError(
            {"transaction_date": ["Transaction date must fall within the selected monthly book's month."]}
        )


def _validate_category_type(category, txn_type) -> None:
    if category is not None and category.type != txn_type:
        raise ValidationError(
            {"category_id": ["Category type must match the transaction type."]}
        )


def create_transaction(user, data: dict) -> Transaction:
    """
    Create an INCOME/EXPENSE transaction.

    All referenced objects must belong to ``user``; the book must not be
    archived; a MONTHLY book only accepts dates inside its month; category and
    payment method must be active and the category type must match.
    """
    with transaction.atomic():
        book = _get_owned_book(user, data["book_id"], lock=True)
        if book.is_archived:
            raise ValidationError({"book_id": ["Archived books do not accept new transactions."]})
        _validate_book_accepts_date(book, data["transaction_date"])

        category = None
        if data.get("category_id") is not None:
            category = _get_selectable_reference(Category, "category_id", user, data["category_id"])
            _validate_category_type(category, data["type"])

        payment_method = None
        if data.get("payment_method_id") is not None:
            payment_method = _get_selectable_reference(
                PaymentMethod, "payment_method_id", user, data["payment_method_id"]
            )

        return Transaction.objects.create(
            book=book,
            category=category,
            payment_method=payment_method,
            type=data["type"],
            amount=data["amount"],
            transaction_date=data["transaction_date"],
            description=data.get("description"),
        )


def _lock_owned_transaction(user, txn_id, manager) -> Transaction:
    """Row-lock a transaction owned (via its book) by ``user``; raises DoesNotExist otherwise."""
    return manager.select_for_update(of=("self",)).get(pk=txn_id, book__owner=user)


def update_transaction(user, txn_id, data: dict) -> Transaction:
    """
    Apply a partial update and re-validate every invariant on the result.

    * Archived books are read-only: neither editing nor moving out is allowed.
    * Moving to another book requires an owned, non-archived target.
    * If the book is unchanged and is MONTHLY, a date in another month atomically
      moves the entry to that month's book (created on demand).
    * Category / payment method are only checked for activity when the selection
      changes; an unchanged (possibly inactive) historical reference is kept.

    Raises ``Transaction.DoesNotExist`` if the transaction is not an active
    transaction owned by ``user`` (including one soft-deleted concurrently).
    """
    with transaction.atomic():
        txn = _lock_owned_transaction(user, txn_id, Transaction.objects)
        if txn.book.is_archived:
            raise ValidationError({"detail": ["Transactions in an archived book cannot be modified."]})

        new_type = data.get("type", txn.type)
        new_date = data.get("transaction_date", txn.transaction_date)

        # --- Resolve the target book ------------------------------------
        book = txn.book
        if "book_id" in data and data["book_id"] != txn.book_id:
            book = _get_owned_book(user, data["book_id"], lock=True)
            if book.is_archived:
                raise ValidationError({"book_id": ["Archived books do not accept new transactions."]})
            _validate_book_accepts_date(book, new_date)
        elif (
            book.type == BookType.MONTHLY
            and "transaction_date" in data
            and (book.year, book.month) != (new_date.year, new_date.month)
        ):
            try:
                book, _created = ensure_monthly_book(user, new_date.year, new_date.month)
            except ValidationError:
                raise ValidationError(
                    {"transaction_date": ["Transaction date is outside the supported range."]}
                )
            if book.is_archived:
                raise ValidationError({"transaction_date": ["The target monthly book is archived."]})

        # --- Resolve references -----------------------------------------
        category = txn.category
        if "category_id" in data:
            new_id = data["category_id"]
            if new_id is None:
                category = None
            elif new_id != txn.category_id:
                category = _get_selectable_reference(Category, "category_id", user, new_id)
        _validate_category_type(category, new_type)

        payment_method = txn.payment_method
        if "payment_method_id" in data:
            new_id = data["payment_method_id"]
            if new_id is None:
                payment_method = None
            elif new_id != txn.payment_method_id:
                payment_method = _get_selectable_reference(
                    PaymentMethod, "payment_method_id", user, new_id
                )

        # --- Apply -------------------------------------------------------
        txn.book = book
        txn.category = category
        txn.payment_method = payment_method
        txn.type = new_type
        txn.transaction_date = new_date
        if "amount" in data:
            txn.amount = data["amount"]
        if "description" in data:
            txn.description = data["description"]
        txn.save()
        return txn


def soft_delete_transaction(user, txn_id) -> None:
    """
    Soft-delete by setting ``deleted_at``. Idempotent: an already-deleted row is
    left untouched (original ``deleted_at`` preserved). Rows in archived books
    are read-only and cannot be deleted.
    """
    with transaction.atomic():
        txn = _lock_owned_transaction(user, txn_id, Transaction.all_objects)
        if txn.deleted_at is not None:
            return
        if txn.book.is_archived:
            raise ValidationError({"detail": ["Transactions in an archived book cannot be deleted."]})
        txn.deleted_at = timezone.now()
        txn.save(update_fields=["deleted_at", "updated_at"])
