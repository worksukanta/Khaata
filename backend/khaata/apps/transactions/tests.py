"""
Model, constraint and service tests for categories and payment methods.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from khaata.apps.transactions.models import Category, CategoryType, PaymentMethod
from khaata.apps.transactions.services import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    DEFAULT_PAYMENT_METHODS,
    create_category,
    create_payment_method,
    seed_user_defaults,
    update_category,
    update_payment_method,
)

User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user(email="svc@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="svc2@example.com", password="SecurePassword123!")


# ---------------------------------------------------------------------------
# Models and constraints
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_category_defaults(user):
    c = Category.objects.create(owner=user, name="Coffee", type=CategoryType.EXPENSE)
    assert c.id is not None and len(str(c.id)) == 36
    assert c.is_active is True
    assert c.is_default is False
    assert c.created_at and c.updated_at


@pytest.mark.django_db
def test_category_unique_case_insensitive_per_owner_and_type(user):
    Category.objects.create(owner=user, name="Coffee", type="EXPENSE")
    with pytest.raises(IntegrityError), transaction.atomic():
        Category.objects.create(owner=user, name="cOFFEE", type="EXPENSE")


@pytest.mark.django_db
def test_category_same_name_allowed_across_types_and_owners(user, other_user):
    Category.objects.create(owner=user, name="Other", type="EXPENSE")
    Category.objects.create(owner=user, name="Other", type="INCOME")
    Category.objects.create(owner=other_user, name="Other", type="EXPENSE")
    assert Category.objects.filter(name="Other").count() == 3


@pytest.mark.django_db
def test_category_invalid_type_rejected_by_db(user):
    with pytest.raises(IntegrityError), transaction.atomic():
        Category.objects.create(owner=user, name="Bad", type="TRANSFER")


@pytest.mark.django_db
def test_payment_method_unique_case_insensitive_per_owner(user, other_user):
    PaymentMethod.objects.create(owner=user, name="Cash")
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentMethod.objects.create(owner=user, name="CASH")
    PaymentMethod.objects.create(owner=other_user, name="Cash")


@pytest.mark.django_db
def test_str_representations(user):
    assert str(Category.objects.create(owner=user, name="Tea", type="EXPENSE")) == "Tea (EXPENSE)"
    assert str(PaymentMethod.objects.create(owner=user, name="Wallet")) == "Wallet"


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_seed_user_defaults_creates_expected_rows(user):
    seed_user_defaults(user)
    assert Category.objects.filter(owner=user, type="EXPENSE").count() == len(DEFAULT_EXPENSE_CATEGORIES)
    assert Category.objects.filter(owner=user, type="INCOME").count() == len(DEFAULT_INCOME_CATEGORIES)
    assert Category.objects.filter(owner=user, is_default=True).count() == (
        len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)
    )
    assert set(PaymentMethod.objects.filter(owner=user).values_list("name", flat=True)) == set(
        DEFAULT_PAYMENT_METHODS
    )
    assert PaymentMethod.objects.filter(owner=user).count() == 6


@pytest.mark.django_db
def test_seed_user_defaults_is_idempotent_and_preserves_edits(user):
    seed_user_defaults(user)
    salary = Category.objects.get(owner=user, name="Salary", type="INCOME")
    salary.is_active = False
    salary.save()
    cash = PaymentMethod.objects.get(owner=user, name="Cash")
    cash.name = "Pocket Cash"
    cash.save()
    total_categories = Category.objects.filter(owner=user).count()

    seed_user_defaults(user)

    salary.refresh_from_db()
    assert salary.is_active is False
    # Renamed default is not matched, so the original name is re-seeded once.
    assert PaymentMethod.objects.filter(owner=user).count() == 7
    assert Category.objects.filter(owner=user).count() == total_categories


@pytest.mark.django_db
def test_seed_user_defaults_skips_case_insensitive_existing(user):
    Category.objects.create(owner=user, name="salary", type="INCOME")
    PaymentMethod.objects.create(owner=user, name="upi")
    seed_user_defaults(user)
    assert Category.objects.filter(owner=user, type="INCOME", name__iexact="salary").count() == 1
    assert PaymentMethod.objects.filter(owner=user, name__iexact="upi").count() == 1


@pytest.mark.django_db
def test_seed_only_affects_target_user(user, other_user):
    seed_user_defaults(user)
    assert Category.objects.filter(owner=other_user).count() == 0
    assert PaymentMethod.objects.filter(owner=other_user).count() == 0


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_category_service_sets_owner_and_not_default(user):
    c = create_category(user, {"name": "Coffee", "type": "EXPENSE"})
    assert c.owner == user
    assert c.is_default is False


@pytest.mark.django_db
def test_create_category_duplicate_raises_validation_error(user):
    create_category(user, {"name": "Coffee", "type": "EXPENSE"})
    with pytest.raises(ValidationError) as exc:
        create_category(user, {"name": "COFFEE", "type": "EXPENSE"})
    assert "name" in exc.value.message_dict
    # The connection is still usable after the handled IntegrityError.
    assert Category.objects.filter(owner=user).count() == 1


@pytest.mark.django_db
def test_update_category_duplicate_raises_validation_error(user):
    create_category(user, {"name": "Coffee", "type": "EXPENSE"})
    tea = create_category(user, {"name": "Tea", "type": "EXPENSE"})
    with pytest.raises(ValidationError):
        update_category(tea, {"name": "coffee"})


@pytest.mark.django_db
def test_update_category_allows_case_only_rename_of_self(user):
    tea = create_category(user, {"name": "tea", "type": "EXPENSE"})
    update_category(tea, {"name": "Tea"})
    tea.refresh_from_db()
    assert tea.name == "Tea"


@pytest.mark.django_db
def test_create_and_update_payment_method_service(user):
    pm = create_payment_method(user, {"name": "Wallet"})
    assert pm.owner == user
    with pytest.raises(ValidationError):
        create_payment_method(user, {"name": "wallet"})
    other = create_payment_method(user, {"name": "Cheque"})
    with pytest.raises(ValidationError):
        update_payment_method(other, {"name": "WALLET"})
    other.refresh_from_db()  # discard the rejected in-memory rename
    assert other.name == "Cheque"
    update_payment_method(other, {"is_active": False})
    other.refresh_from_db()
    assert other.is_active is False
