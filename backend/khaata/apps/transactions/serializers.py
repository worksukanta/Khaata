"""
Serializers for the Categories, Payment Methods and Transactions API.

Owner, is_default, audit timestamps and deleted_at are never accepted from the client.
"""
from decimal import Decimal

from rest_framework import serializers

from khaata.apps.transactions.models import (
    Category,
    CategoryType,
    PaymentMethod,
    Transaction,
    TransactionType,
)


class CategorySerializer(serializers.ModelSerializer):
    """Read serializer for categories."""

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "type",
            "is_default",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CategoryCreateSerializer(serializers.Serializer):
    """POST /categories/ — name and type are required."""

    name = serializers.CharField(max_length=80)
    type = serializers.ChoiceField(choices=CategoryType.choices)


class CategoryUpdateSerializer(serializers.Serializer):
    """PATCH /categories/{id}/ — name and is_active only; type is immutable."""

    name = serializers.CharField(max_length=80, required=False)
    is_active = serializers.BooleanField(required=False)
    type = serializers.ChoiceField(choices=CategoryType.choices, required=False)

    def validate_type(self, value):
        if self.instance is not None and value != self.instance.type:
            raise serializers.ValidationError("Category type cannot be changed.")
        return value


class PaymentMethodSerializer(serializers.ModelSerializer):
    """Read serializer for payment methods."""

    class Meta:
        model = PaymentMethod
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class PaymentMethodCreateSerializer(serializers.Serializer):
    """POST /payment-methods/ — name is required."""

    name = serializers.CharField(max_length=60)


class PaymentMethodUpdateSerializer(serializers.Serializer):
    """PATCH /payment-methods/{id}/ — name and is_active only."""

    name = serializers.CharField(max_length=60, required=False)
    is_active = serializers.BooleanField(required=False)


# ---------------------------------------------------------------------------
# Transactions (BE-005)
# ---------------------------------------------------------------------------
class TransactionCategorySerializer(serializers.ModelSerializer):
    """Compact category representation embedded in a transaction."""

    class Meta:
        model = Category
        fields = ["id", "name", "type"]
        read_only_fields = fields


class TransactionPaymentMethodSerializer(serializers.ModelSerializer):
    """Compact payment-method representation embedded in a transaction."""

    class Meta:
        model = PaymentMethod
        fields = ["id", "name"]
        read_only_fields = fields


class TransactionSerializer(serializers.ModelSerializer):
    """Read serializer: API_CONTRACT.md section 5 response fields."""

    book_id = serializers.UUIDField(read_only=True)
    category = TransactionCategorySerializer(read_only=True)
    payment_method = TransactionPaymentMethodSerializer(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "book_id",
            "type",
            "amount",
            "transaction_date",
            "category",
            "payment_method",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


def _amount_field(**kwargs):
    return serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
        error_messages={"min_value": "Ensure this value is greater than zero."},
        **kwargs,
    )


class TransactionCreateSerializer(serializers.Serializer):
    """POST /transactions/ � book_id, type, amount and transaction_date are required."""

    book_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=TransactionType.choices)
    amount = _amount_field()
    transaction_date = serializers.DateField()
    category_id = serializers.UUIDField(required=False, allow_null=True)
    payment_method_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )


class TransactionUpdateSerializer(serializers.Serializer):
    """PATCH /transactions/{id}/ � every field optional; required fields cannot be null."""

    book_id = serializers.UUIDField(required=False)
    type = serializers.ChoiceField(choices=TransactionType.choices, required=False)
    amount = _amount_field(required=False)
    transaction_date = serializers.DateField(required=False)
    category_id = serializers.UUIDField(required=False, allow_null=True)
    payment_method_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )


class TransactionFilterSerializer(serializers.Serializer):
    """Validates GET /transactions/ query parameters (malformed values ? 400)."""

    book_id = serializers.UUIDField(required=False)
    type = serializers.ChoiceField(choices=TransactionType.choices, required=False)
    category_id = serializers.UUIDField(required=False)
    payment_method_id = serializers.UUIDField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    search = serializers.CharField(required=False, allow_blank=True)
