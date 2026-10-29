"""
Tests for the custom User model and accounts configuration.

Verifies:
- AUTH_USER_MODEL is "accounts.User".
- User model uses UUID primary key.
- Email is the USERNAME_FIELD.
- User can be created with email + password.
- Password is hashed, never stored as plaintext.
- display_name and timezone fields exist with correct defaults.
- Superuser creation works correctly.
"""
import uuid

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()


def test_auth_user_model_setting():
    """AUTH_USER_MODEL must be 'accounts.User'."""
    assert settings.AUTH_USER_MODEL == "accounts.User"


def test_user_model_is_khaata_user():
    """get_user_model() must return the custom User class."""
    assert User.__name__ == "User"
    assert User._meta.app_label == "accounts"


def test_user_pk_is_uuid_field():
    """Primary key field must be a UUIDField."""
    pk_field = User._meta.get_field("id")
    from django.db.models import UUIDField
    assert isinstance(pk_field, UUIDField)


def test_username_field_is_email():
    """USERNAME_FIELD must be 'email' so email is the login identity."""
    assert User.USERNAME_FIELD == "email"


@pytest.mark.django_db
def test_create_user_sets_uuid_pk():
    """Newly created user has a valid UUID as its pk."""
    user = User.objects.create_user(
        email="test@example.com",
        password="TestPass123!",
    )
    assert isinstance(user.pk, uuid.UUID)


@pytest.mark.django_db
def test_create_user_hashes_password():
    """Password must be stored as a hash, never as plaintext."""
    raw_password = "VerySecret99!"
    user = User.objects.create_user(
        email="hashed@example.com",
        password=raw_password,
    )
    # check_password verifies the hash; direct equality must fail.
    assert user.password != raw_password
    assert user.check_password(raw_password) is True


@pytest.mark.django_db
def test_user_default_timezone():
    """Default timezone must be 'Asia/Kolkata' per the approved spec."""
    user = User.objects.create_user(
        email="tz@example.com",
        password="TestPass123!",
    )
    assert user.timezone == "Asia/Kolkata"


@pytest.mark.django_db
def test_user_display_name_blank_by_default():
    """display_name defaults to empty string (not NULL)."""
    user = User.objects.create_user(
        email="noname@example.com",
        password="TestPass123!",
    )
    assert user.display_name == ""


@pytest.mark.django_db
def test_create_user_with_display_name():
    """display_name is stored correctly when provided."""
    user = User.objects.create_user(
        email="named@example.com",
        password="TestPass123!",
        display_name="Alice",
    )
    assert user.display_name == "Alice"


@pytest.mark.django_db
def test_user_str_is_email():
    """__str__ must return the user's email."""
    user = User.objects.create_user(
        email="str@example.com",
        password="TestPass123!",
    )
    assert str(user) == "str@example.com"


@pytest.mark.django_db
def test_email_unique_constraint():
    """Duplicate email must raise IntegrityError."""
    from django.db import IntegrityError
    User.objects.create_user(email="dupe@example.com", password="TestPass123!")
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="dupe@example.com", password="OtherPass456!")


@pytest.mark.django_db
def test_email_normalized_to_lowercase():
    """
    Email is fully lowercased on creation (local + domain) so that the
    unique constraint is effectively case-insensitive, per DATABASE_DESIGN.md.
    """
    user = User.objects.create_user(
        email="Alice@Example.COM",
        password="TestPass123!",
    )
    assert user.email == "alice@example.com"


@pytest.mark.django_db
def test_email_case_insensitive_uniqueness():
    """
    Creating a second user with the same email in different case must fail,
    because both are normalized to the same lowercase address.
    """
    from django.db import IntegrityError
    User.objects.create_user(email="BOB@example.com", password="TestPass123!")
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="bob@example.com", password="OtherPass456!")


@pytest.mark.django_db
def test_create_superuser():
    """create_superuser produces a user with is_staff and is_superuser."""
    admin = User.objects.create_superuser(
        email="admin@example.com",
        password="AdminPass123!",
    )
    assert admin.is_staff is True
    assert admin.is_superuser is True
