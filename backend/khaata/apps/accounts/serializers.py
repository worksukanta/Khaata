"""
Serializers for authentication and user account management.
"""
import zoneinfo

from django.contrib.auth import get_user_model
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for public user representation.
    Never exposes passwords, password hashes, or internal permissions.
    """

    class Meta:
        model = User
        fields = ["id", "email", "display_name", "timezone"]
        read_only_fields = ["id", "email"]


class RegisterSerializer(serializers.Serializer):
    """
    Serializer for user registration.
    Validates email format, case-insensitive uniqueness, and password strength.
    """

    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )
    display_name = serializers.CharField(
        max_length=120,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate_email(self, value):
        normalized = BaseUserManager.normalize_email(value).lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return normalized

    def validate_password(self, value):
        if len(value) < 10:
            raise serializers.ValidationError("Password must be at least 10 characters long.")
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        try:
            return User.objects.create_user(
                email=validated_data["email"],
                password=validated_data["password"],
                display_name=validated_data.get("display_name", ""),
            )
        except IntegrityError:
            # Concurrent registration of the same email: the DB unique
            # constraint is authoritative; report it as a validation error.
            raise serializers.ValidationError(
                {"email": ["A user with this email address already exists."]}
            )


class LoginSerializer(serializers.Serializer):
    """
    Serializer for user login credentials.
    """

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating user profile preferences (display_name, timezone).
    id and email are strictly read-only.
    """

    display_name = serializers.CharField(
        max_length=120,
        required=False,
        allow_blank=True,
    )
    timezone = serializers.CharField(
        max_length=64,
        required=False,
    )

    class Meta:
        model = User
        fields = ["id", "email", "display_name", "timezone"]
        read_only_fields = ["id", "email"]

    def validate_timezone(self, value):
        if value not in zoneinfo.available_timezones():
            try:
                zoneinfo.ZoneInfo(value)
            except Exception:
                raise serializers.ValidationError("Invalid IANA timezone identifier.")
        return value
