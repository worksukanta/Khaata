"""
Service functions for categories and payment methods.

Encapsulates default seeding and the write paths so that the case-insensitive
uniqueness rule (database constraint is authoritative) is translated into a
consistent validation error.
"""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from khaata.apps.transactions.models import Category, CategoryType, PaymentMethod

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
