"""
Custom User model for Khaata.

Design notes
------------
* UUID primary key — aligns with ADR-003 and DATABASE_DESIGN.md.
* Email is the login identity; username is unused.
* display_name stores the user's preferred display name (max 120 chars).
* timezone stores an IANA timezone string (default Asia/Kolkata per spec).
* AbstractUser is used per approved architecture so that Django's built-in
  auth machinery (password hashing, session handling, admin) is inherited
  without modification.
* This model MUST be referenced by AUTH_USER_MODEL before any migration is
  created. Do NOT swap the model after migrations exist.
"""
import uuid

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class KhaataUserManager(UserManager):
    """
    Custom manager that makes email the canonical lookup field instead of
    username, while keeping AbstractUser's built-in helper methods intact.
    """

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        # normalize_email lowercases the domain; we also lowercase the local
        # part so that the unique constraint is effectively case-insensitive
        # (DATABASE_DESIGN.md: "normalize email; enforce case-insensitive
        # uniqueness via normalized value or functional unique index").
        email = self.normalize_email(email).lower()
        # username is set to the normalized email so AbstractUser internals
        # that expect a username value continue to work.
        user = self.model(username=email, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields.get("is_staff"):
            raise ValueError("Superuser must have is_staff=True.")
        if not extra_fields.get("is_superuser"):
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Khaata user.

    AUTH_USER_MODEL = "accounts.User" in settings/base.py points here.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Email is the login identity. AbstractUser already has an email field;
    # we make it required, unique, and the USERNAME_FIELD.
    email = models.EmailField(
        unique=True,
        max_length=254,
        verbose_name="email address",
    )

    # display_name replaces first_name/last_name for simplicity.
    display_name = models.CharField(max_length=120, blank=True)

    # IANA timezone string; default is Asia/Kolkata per the approved spec.
    timezone = models.CharField(
        max_length=64,
        default="Asia/Kolkata",
        help_text="IANA timezone name, e.g. 'Asia/Kolkata' or 'UTC'.",
    )

    # Timestamps — use auto_now for correctness; created_at is set once.
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # AbstractUser uses username as the login field by default.
    # We override this so email is the primary identifier.
    USERNAME_FIELD = "email"
    # username is still required by AbstractUser internals; we set it to
    # the normalized email in the manager so it is always populated.
    REQUIRED_FIELDS = []  # email/password are handled by create_superuser

    objects = KhaataUserManager()

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self):
        return self.email
