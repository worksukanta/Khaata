"""
Book model for Khaata.

Design notes
------------
* UUID primary key — aligns with ADR-003, ADR-004, and DATABASE_DESIGN.md.
* owner foreign key to User model, cascade delete.
* type: MONTHLY, EVENT, GENERAL.
* Monthly books:
  - exactly one per (owner, year, month), enforced by DB UniqueConstraint.
  - year and month (1-12) are required.
  - start_date and end_date are null.
  - cannot be archived or manually deleted in V1.
* Event & General books:
  - year and month must be null.
  - start_date and end_date are optional; if both provided, end_date >= start_date.
  - can be archived (is_archived = True) or restored.
* opening_balance: DecimalField(max_digits=14, decimal_places=2), default 0.00.
"""
from decimal import Decimal
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class BookType(models.TextChoices):
    MONTHLY = "MONTHLY", "Monthly"
    EVENT = "EVENT", "Event"
    GENERAL = "GENERAL", "General"


class Book(models.Model):
    """
    A financial book representing a monthly ledger, event ledger, or general ledger.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="books",
        db_index=True,
    )
    type = models.CharField(
        max_length=20,
        choices=BookType.choices,
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    month = models.PositiveSmallIntegerField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    opening_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "book"
        verbose_name_plural = "books"
        ordering = ["-created_at"]
        constraints = [
            # 1. Type, year, month consistency:
            # Monthly books must have year and month (1-12); Event/General must have year=NULL, month=NULL.
            models.CheckConstraint(
                condition=(
                    (
                        models.Q(type=BookType.MONTHLY)
                        & models.Q(year__isnull=False)
                        & models.Q(month__isnull=False)
                        & models.Q(month__gte=1)
                        & models.Q(month__lte=12)
                    )
                    | (
                        models.Q(type__in=[BookType.EVENT, BookType.GENERAL])
                        & models.Q(year__isnull=True)
                        & models.Q(month__isnull=True)
                    )
                ),
                name="book_type_year_month_consistency",
            ),
            # 2. Exactly one monthly book per user, year, month:
            models.UniqueConstraint(
                fields=["owner", "year", "month"],
                condition=models.Q(type=BookType.MONTHLY),
                name="unique_monthly_book_per_user_year_month",
            ),
            # 3. If start_date and end_date both provided, end_date >= start_date:
            models.CheckConstraint(
                condition=(
                    models.Q(end_date__isnull=True)
                    | models.Q(start_date__isnull=True)
                    | models.Q(end_date__gte=models.F("start_date"))
                ),
                name="book_end_date_gte_start_date",
            ),
            # 4. opening_balance >= 0:
            models.CheckConstraint(
                condition=models.Q(opening_balance__gte=0),
                name="book_opening_balance_non_negative",
            ),
        ]

    def clean(self):
        super().clean()
        if self.type == BookType.MONTHLY:
            if self.year is None or self.month is None:
                raise ValidationError("Monthly books require both year and month.")
            if not (1 <= self.month <= 12):
                raise ValidationError("Month must be between 1 and 12.")
            if self.start_date is not None or self.end_date is not None:
                raise ValidationError("Monthly books cannot have start_date or end_date.")
        elif self.type in [BookType.EVENT, BookType.GENERAL]:
            if self.year is not None or self.month is not None:
                raise ValidationError("Event and general books cannot have year or month.")
            if self.start_date and self.end_date and self.end_date < self.start_date:
                raise ValidationError("end_date cannot be earlier than start_date.")

        if self.opening_balance is not None and self.opening_balance < Decimal("0.00"):
            raise ValidationError("opening_balance cannot be negative.")

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
