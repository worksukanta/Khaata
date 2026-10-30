"""
Category and PaymentMethod models for Khaata.

Design notes (DATABASE_DESIGN.md, API_CONTRACT.md section 4, BR-07)
-------------------------------------------------------------------
* UUID primary keys; both records are owned by a single user.
* Category: unique per (owner, type, lower(name)); type is INCOME or EXPENSE.
* PaymentMethod: unique per (owner, lower(name)); descriptive label only,
  never a financial account.
* Records are deactivated (is_active=False), never hard-deleted by the API.
  Future Transaction/BudgetAllocation foreign keys must use PROTECT.
* created_at/updated_at follow the Book/User convention.
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
