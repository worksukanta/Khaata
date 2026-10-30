"""
Serializers for the Categories and Payment Methods API.

Owner, is_default and timestamps are never accepted from the client.
"""
from rest_framework import serializers

from khaata.apps.transactions.models import Category, CategoryType, PaymentMethod


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
