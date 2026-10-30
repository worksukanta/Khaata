"""
Admin configuration for budgets and allocations.

Allocation changes made through the admin inline are validated by the same
aggregate cap rule as the API: sum(allocations) <= budget.total_limit. The
check runs in a custom inline formset's ``clean()`` method, which fires inside
Django admin's normal form-validation phase *before* any database write. Any
violation is surfaced as a non-field form error on the inline.

Ownership checks that the service layer performs (category must belong to the
budget owner and be an active EXPENSE category) are intentionally *not*
duplicated here — the Django admin is a trusted internal tool. The invariant
that must hold regardless of entry point is only the allocation cap.
"""
from decimal import Decimal

from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError

from khaata.apps.budgets.models import Budget, BudgetAllocation

ZERO = Decimal("0.00")


class BudgetAllocationFormSet(forms.BaseInlineFormSet):
    """
    Inline formset that enforces ``sum(allocations) <= budget.total_limit``.

    Django's formset ``clean()`` is called after every individual form has
    been validated. At that point ``self.instance`` is the parent ``Budget``,
    so we have both the current limit and the full proposed allocation list.

    We must account for:
    * New / changed rows (form.cleaned_data["amount"]).
    * Rows marked for deletion (form.cleaned_data["DELETE"] is True).
    * Forms with validation errors (skipped — they cannot contribute a valid
      amount and the individual form will already surface its own error).

    The check mirrors the service-layer rule in ``replace_allocations``:
    ``total > budget.total_limit`` is rejected.
    """

    def clean(self):
        super().clean()
        # ``self.instance`` may not be saved yet on first add, so
        # total_limit may not be set; fall back to zero in that case.
        budget: Budget = self.instance
        total_limit: Decimal = getattr(budget, "total_limit", ZERO) or ZERO

        total = ZERO
        for form in self.forms:
            if not hasattr(form, "cleaned_data"):
                # Validation error on this form; skip (it will be shown).
                continue
            if form.cleaned_data.get("DELETE"):
                continue
            amount = form.cleaned_data.get("amount")
            if amount is not None:
                total += amount

        if total > total_limit:
            raise ValidationError(
                f"Allocation total ({total}) exceeds the budget total limit "
                f"({total_limit}). Reduce the amounts or increase the budget limit first."
            )


class BudgetAllocationInline(admin.TabularInline):
    model = BudgetAllocation
    extra = 0
    raw_id_fields = ("category",)
    formset = BudgetAllocationFormSet


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("scope", "owner", "year", "month", "book", "total_limit", "created_at")
    list_filter = ("scope",)
    search_fields = ("owner__email",)
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("book",)
    inlines = [BudgetAllocationInline]
