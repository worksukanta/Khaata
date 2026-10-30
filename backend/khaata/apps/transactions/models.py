"""
Category, PaymentMethod and Transaction models for Khaata.

Design notes (DATABASE_DESIGN.md, API_CONTRACT.md sections 4-5, BR-03, BR-07)
-----------------------------------------------------------------------------
* UUID primary keys; Category and PaymentMethod are owned by a single user.
* Category: unique per (owner, type, lower(name)); type is INCOME or EXPENSE.
* PaymentMethod: unique per (owner, lower(name)); descriptive label only,
  never a financial account.
* Records are deactivated (is_active=False), never hard-deleted by the API.
  Transaction/BudgetAllocation foreign keys use PROTECT.
* created_at/updated_at follow the Book/User convention.
* Transaction: belongs to exactly one Book (ownership is derived through
  ``book.owner``; there is no separate owner column in the approved schema).
  Amount is Decimal(14, 2) and strictly positive. Soft-deleted via
  ``deleted_at``; ``Transaction.objects`` is the active-only manager and
  ``Transaction.all_objects`` is the unrestricted audit/admin manager.
  Category/payment-method ownership and category-type compatibility are
  cross-table rules enforced in ``services.py``.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class CategoryType(models.TextChoices):
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    name = models.CharField(max_length=80)
    type = models.CharField(max_length=10, choices=CategoryType.choices)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "category"
        verbose_name_plural = "categories"
        ordering = ["type", "name"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "owner",
                "type",
                name="unique_category_owner_type_lower_name",
            ),
            models.CheckConstraint(
                condition=models.Q(type__in=CategoryType.values),
                name="category_type_valid",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.type})"


class PaymentMethod(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_methods",
    )
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "payment method"
        verbose_name_plural = "payment methods"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "owner",
                name="unique_payment_method_owner_lower_name",
            ),
        ]

    def __str__(self):
        return self.name


class TransactionType(models.TextChoices):
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"


class ActiveTransactionManager(models.Manager):
    """Default manager: excludes soft-deleted transactions."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    book = models.ForeignKey(
        "books.Book",
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transactions",
    )
    payment_method = models.ForeignKey(
        PaymentMethod,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transactions",
    )
    type = models.CharField(max_length=10, choices=TransactionType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    transaction_date = models.DateField()
    description = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = ActiveTransactionManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = "transaction"
        verbose_name_plural = "transactions"
        ordering = ["-transaction_date", "-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="transaction_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(type__in=TransactionType.values),
                name="transaction_type_valid",
            ),
        ]
        indexes = [
            models.Index(
                fields=["book", "transaction_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="txn_book_date_active_idx",
            ),
            models.Index(
                fields=["transaction_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="txn_date_active_idx",
            ),
        ]

    def __str__(self):
        return f"{self.type} {self.amount} on {self.transaction_date}"
