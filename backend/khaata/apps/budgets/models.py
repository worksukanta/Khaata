"""
Budget and BudgetAllocation models for Khaata.

Design notes (DATABASE_DESIGN.md BUDGET / BUDGET_ALLOCATION, API_CONTRACT.md
section 6, BR-04, BR-05)
-----------------------------------------------------------------------------
* UUID primary keys. ``total_limit`` and allocation ``amount`` are
  Decimal(14, 2) and non-negative.
* Budget scope MONTHLY_OVERALL: ``year``/``month`` required, ``book`` null.
  One per (owner, year, month). It need not have a materialised monthly book.
* Budget scope EVENT: ``book`` required (type EVENT, same owner - a cross-table
  rule enforced in ``services.py``), ``year``/``month`` null. One per book.
* ``Budget.book`` uses PROTECT (financial reference).
* BudgetAllocation: one row per (budget, category); category FK uses PROTECT so
  history is preserved when categories are deactivated. Rows are deleted with
  their parent budget (CASCADE) per DATABASE_DESIGN.md.
* No spent/remaining totals are stored; they are derived from active
  transactions at read time (ADR / AGENTS.md section 4).
* The rule "sum(allocations) <= total_limit" spans rows and is enforced by the
  service layer under a row lock on the parent budget.
"""
from decimal import Decimal
import uuid

from django.conf import settings
from django.db import models


class BudgetScope(models.TextChoices):
    MONTHLY_OVERALL = "MONTHLY_OVERALL", "Monthly overall"
    EVENT = "EVENT", "Event"


class Budget(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="budgets",
    )
    scope = models.CharField(max_length=20, choices=BudgetScope.choices)
    book = models.ForeignKey(
        "books.Book",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="budgets",
    )
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    month = models.PositiveSmallIntegerField(null=True, blank=True)
    total_limit = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "budget"
        verbose_name_plural = "budgets"
        ordering = ["-scope", "-year", "-month", "-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(scope__in=BudgetScope.values),
                name="budget_scope_valid",
            ),
            # MONTHLY_OVERALL: year + month 1-12, no book.
            # EVENT: book, no year/month.
            models.CheckConstraint(
                condition=(
                    (
                        models.Q(scope=BudgetScope.MONTHLY_OVERALL)
                        & models.Q(book__isnull=True)
                        & models.Q(year__isnull=False)
                        & models.Q(month__isnull=False)
                        & models.Q(month__gte=1)
                        & models.Q(month__lte=12)
                    )
                    | (
                        models.Q(scope=BudgetScope.EVENT)
                        & models.Q(book__isnull=False)
                        & models.Q(year__isnull=True)
                        & models.Q(month__isnull=True)
                    )
                ),
                name="budget_scope_fields_consistency",
            ),
            models.CheckConstraint(
                condition=models.Q(total_limit__gte=0),
                name="budget_total_limit_non_negative",
            ),
            models.UniqueConstraint(
                fields=["owner", "year", "month"],
                condition=models.Q(scope=BudgetScope.MONTHLY_OVERALL),
                name="unique_monthly_budget_per_owner_year_month",
            ),
            models.UniqueConstraint(
                fields=["book"],
                condition=models.Q(scope=BudgetScope.EVENT),
                name="unique_event_budget_per_book",
            ),
        ]

    def __str__(self):
        if self.scope == BudgetScope.MONTHLY_OVERALL:
            return f"Monthly budget {self.year}-{self.month:02d}"
        return f"Event budget {self.book_id}"


class BudgetAllocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    budget = models.ForeignKey(
        Budget,
        on_delete=models.CASCADE,
        related_name="allocations",
    )
    category = models.ForeignKey(
        "transactions.Category",
        on_delete=models.PROTECT,
        related_name="budget_allocations",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        verbose_name = "budget allocation"
        verbose_name_plural = "budget allocations"
        ordering = ["category__name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["budget", "category"],
                name="unique_budget_allocation_budget_category",
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name="budget_allocation_amount_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.category_id}: {self.amount}"
