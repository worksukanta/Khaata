"""
Serializers for the Budgets API (BE-006).

``owner``, timestamps and every derived figure are never accepted from the
client. Derived figures (spent, remaining, utilization, status) are computed on
read by ``khaata.apps.budgets.services`` from active expense transactions.
"""
from decimal import Decimal

from rest_framework import serializers

from khaata.apps.budgets.models import Budget, BudgetScope
from khaata.apps.budgets.services import calculate_budget_spending, classify_utilization

ZERO = Decimal("0.00")
_MONEY = serializers.DecimalField(max_digits=14, decimal_places=2)


def _limit_field(**kwargs):
    """Non-negative Decimal(14, 2) input (budget limits and allocation amounts may be zero)."""
    return serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=ZERO,
        error_messages={"min_value": "Ensure this value is greater than or equal to zero."},
        **kwargs,
    )


def _figures(limit: Decimal, spent: Decimal) -> dict:
    """Derived, string-rendered figures for a limit and the amount spent against it."""
    result = classify_utilization(limit, spent)
    percent = result["utilization_percent"]
    return {
        "spent": _MONEY.to_representation(spent),
        "remaining": _MONEY.to_representation(result["remaining"]),
        "utilization_percent": None if percent is None else _MONEY.to_representation(percent),
        "status": result["status"],
    }


class BudgetSerializer(serializers.ModelSerializer):
    """
    Read serializer: budget definition + allocations + derived spending.

    ``utilization_percent`` is ``null`` only for UNBUDGETED_SPENDING (zero limit
    with positive spending). Remaining is negative when overspent.
    """

    book_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Budget
        fields = [
            "id",
            "scope",
            "book_id",
            "year",
            "month",
            "total_limit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        spending = calculate_budget_spending(instance)
        by_category = spending["by_category"]

        allocations = []
        allocated_total = ZERO
        allocated_spent = ZERO
        for allocation in instance.allocations.select_related("category"):
            category = allocation.category
            spent = by_category.get(category.id, ZERO)
            allocated_total += allocation.amount
            allocated_spent += spent
            allocations.append(
                {
                    "category": {
                        "id": str(category.id),
                        "name": category.name,
                        "type": category.type,
                        "is_active": category.is_active,
                    },
                    "amount": _MONEY.to_representation(allocation.amount),
                    **_figures(allocation.amount, spent),
                }
            )

        data["allocations"] = allocations
        data["allocated_total"] = _MONEY.to_representation(allocated_total)
        data["unallocated"] = _MONEY.to_representation(instance.total_limit - allocated_total)
        # Spending not covered by any allocation (uncategorised + categories
        # without an allocation); it still consumes the overall limit.
        data["unallocated_spent"] = _MONEY.to_representation(spending["total"] - allocated_spent)
        data["uncategorised_spent"] = _MONEY.to_representation(by_category.get(None, ZERO))
        data.update(_figures(instance.total_limit, spending["total"]))
        return data


class BudgetCreateSerializer(serializers.Serializer):
    """POST /budgets/: scope and total_limit required; period/book depend on scope."""

    scope = serializers.ChoiceField(choices=BudgetScope.choices)
    year = serializers.IntegerField(required=False, allow_null=True)
    month = serializers.IntegerField(required=False, allow_null=True)
    book_id = serializers.UUIDField(required=False, allow_null=True)
    total_limit = _limit_field()


class BudgetUpdateSerializer(serializers.Serializer):
    """
    PATCH /budgets/{id}/: every field optional. ``scope`` and ``book_id`` are
    accepted only so a differing value can be rejected explicitly (immutable).
    """

    scope = serializers.ChoiceField(choices=BudgetScope.choices, required=False)
    year = serializers.IntegerField(required=False, allow_null=True)
    month = serializers.IntegerField(required=False, allow_null=True)
    book_id = serializers.UUIDField(required=False, allow_null=True)
    total_limit = _limit_field(required=False)


class AllocationItemSerializer(serializers.Serializer):
    category_id = serializers.UUIDField()
    amount = _limit_field()


class AllocationReplaceSerializer(serializers.Serializer):
    """PUT /budgets/{id}/allocations/: full replacement; an empty list clears all."""

    allocations = AllocationItemSerializer(many=True, allow_empty=True)


class BudgetFilterSerializer(serializers.Serializer):
    """Validates GET /budgets/ query parameters (malformed values -> 400)."""

    scope = serializers.ChoiceField(choices=BudgetScope.choices, required=False)
    year = serializers.IntegerField(required=False, min_value=2000, max_value=2200)
    month = serializers.IntegerField(required=False, min_value=1, max_value=12)
    book_id = serializers.UUIDField(required=False)
