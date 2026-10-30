"""
Serializers for Books API.
"""
from rest_framework import serializers

from khaata.apps.books.models import Book, BookType


class BookSerializer(serializers.ModelSerializer):
    """
    Read/detail serializer for Book domain entity.
    """

    opening_balance = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        coerce_to_string=True,
        read_only=True,
    )

    class Meta:
        model = Book
        fields = [
            "id",
            "type",
            "name",
            "description",
            "year",
            "month",
            "start_date",
            "end_date",
            "opening_balance",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "type",
            "year",
            "month",
            "opening_balance",
            "is_archived",
            "created_at",
            "updated_at",
        ]


class CreateBookSerializer(serializers.Serializer):
    """
    Serializer for creating EVENT or GENERAL books via POST /api/v1/books/.
    """

    type = serializers.ChoiceField(
        choices=[BookType.EVENT, BookType.GENERAL],
        error_messages={
            "invalid_choice": "Type must be either EVENT or GENERAL. Monthly books must be ensured via the monthly ensure endpoint."
        },
    )
    name = serializers.CharField(max_length=150, min_length=1)
    description = serializers.CharField(
        max_length=5000,
        required=False,
        allow_blank=True,
        default="",
    )
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    end_date = serializers.DateField(required=False, allow_null=True, default=None)

    def validate_name(self, value):
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("This field may not be blank.")
        return stripped

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": ["End date cannot be earlier than start date."]})
        return attrs


class UpdateBookSerializer(serializers.Serializer):
    """
    Serializer for updating editable fields on EVENT or GENERAL books via PATCH /api/v1/books/{id}/.
    """

    name = serializers.CharField(max_length=150, min_length=1, required=False)
    description = serializers.CharField(
        max_length=5000,
        required=False,
        allow_blank=True,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate_name(self, value):
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("This field may not be blank.")
        return stripped

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        start_date = attrs.get("start_date", getattr(instance, "start_date", None) if instance else None)
        end_date = attrs.get("end_date", getattr(instance, "end_date", None) if instance else None)
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": ["End date cannot be earlier than start date."]})
        return attrs
