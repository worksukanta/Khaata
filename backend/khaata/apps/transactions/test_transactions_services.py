"""
Model, constraint and service-layer tests for transactions (BE-005).
"""
import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction as db_transaction
from django.db.models.deletion import ProtectedError

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.services import create_book, ensure_monthly_book
from khaata.apps.transactions.models import Category, PaymentMethod, Transaction
from khaata.apps.transactions.services import (
    create_transaction,
    soft_delete_transaction,
    update_transaction,
)

User = get_user_model()
D = datetime.date


@pytest.fixture
def user():
    return User.objects.create_user(email="txsvc@example.com", password="SecurePassword123!")


@pytest.fixture
def other_user():
    return User.objects.create_user(email="txsvc2@example.com", password="SecurePassword123!")


@pytest.fixture
def october(user):
    return ensure_monthly_book(user, 2026, 10)[0]


@pytest.fixture
def event_book(user):
    return create_book(user, {"type": BookType.EVENT, "name": "Puja"})


@pytest.fixture
def expense_cat(user):
    return Category.objects.create(owner=user, name="Food", type="EXPENSE")


@pytest.fixture
def income_cat(user):
    return Category.objects.create(owner=user, name="Salary", type="INCOME")


@pytest.fixture
def method(user):
    return PaymentMethod.objects.create(owner=user, name="Cash")


def _payload(book, **overrides):
    data = {
        "book_id": book.id,
        "type": "EXPENSE",
        "amount": Decimal("250.00"),
        "transaction_date": D(2026, 10, 27),
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# Model / DB constraints
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_model_defaults_and_uuid_pk(october):
    t = Transaction.objects.create(
        book=october, type="EXPENSE", amount=Decimal("1.00"), transaction_date=D(2026, 10, 1)
    )
    assert len(str(t.id)) == 36
    assert t.deleted_at is None
    assert t.category is None and t.payment_method is None
    assert t.created_at and t.updated_at


@pytest.mark.django_db
@pytest.mark.parametrize("amount", [Decimal("0.00"), Decimal("-1.00")])
def test_db_rejects_non_positive_amount(october, amount):
    with pytest.raises(IntegrityError), db_transaction.atomic():
        Transaction.objects.create(
            book=october, type="EXPENSE", amount=amount, transaction_date=D(2026, 10, 1)
        )


@pytest.mark.django_db
def test_db_rejects_invalid_type(october):
    with pytest.raises(IntegrityError), db_transaction.atomic():
        Transaction.objects.create(
            book=october, type="TRANSFER", amount=Decimal("1.00"), transaction_date=D(2026, 10, 1)
        )


@pytest.mark.django_db
def test_fk_protect_book_category_payment_method(october, expense_cat, method):
    Transaction.objects.create(
        book=october,
        category=expense_cat,
        payment_method=method,
        type="EXPENSE",
        amount=Decimal("5.00"),
        transaction_date=D(2026, 10, 1),
    )
    with pytest.raises(ProtectedError):
        october.delete()
    with pytest.raises(ProtectedError):
        expense_cat.delete()
    with pytest.raises(ProtectedError):
        method.delete()


@pytest.mark.django_db
def test_default_manager_excludes_soft_deleted(user, october):
    t = create_transaction(user, _payload(october))
    soft_delete_transaction(user, t.id)
    assert Transaction.objects.count() == 0
    assert Transaction.all_objects.count() == 1


@pytest.mark.django_db
def test_decimal_precision_round_trip(user, october):
    t = create_transaction(user, _payload(october, amount=Decimal("999999999999.99")))
    t.refresh_from_db()
    assert t.amount == Decimal("999999999999.99")
    assert isinstance(t.amount, Decimal)


# ---------------------------------------------------------------------------
# create_transaction
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_create_expense_and_income(user, october, expense_cat, income_cat, method):
    e = create_transaction(
        user,
        _payload(october, category_id=expense_cat.id, payment_method_id=method.id, description="Snacks"),
    )
    i = create_transaction(
        user, _payload(october, type="INCOME", category_id=income_cat.id, amount=Decimal("1000.00"))
    )
    assert (e.type, e.category, e.payment_method, e.description) == ("EXPENSE", expense_cat, method, "Snacks")
    assert (i.type, i.category) == ("INCOME", income_cat)


@pytest.mark.django_db
def test_create_without_optional_references(user, october):
    t = create_transaction(user, _payload(october))
    assert t.category is None and t.payment_method is None and t.description is None


@pytest.mark.django_db
def test_create_in_event_book_allows_any_month(user, event_book):
    t = create_transaction(user, _payload(event_book, transaction_date=D(2027, 1, 5)))
    assert t.book_id == event_book.id


@pytest.mark.django_db
def test_create_rejects_other_users_book(other_user, october):
    with pytest.raises(ValidationError) as exc:
        create_transaction(other_user, _payload(october))
    assert "book_id" in exc.value.message_dict
    assert Transaction.all_objects.count() == 0


@pytest.mark.django_db
def test_create_rejects_unknown_book(user, october):
    import uuid

    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, book_id=uuid.uuid4()))
    assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_create_rejects_archived_book(user, event_book):
    event_book.is_archived = True
    event_book.save()
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(event_book))
    assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_create_rejects_date_outside_monthly_book(user, october):
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, transaction_date=D(2026, 11, 1)))
    assert "transaction_date" in exc.value.message_dict


@pytest.mark.django_db
def test_create_rejects_category_type_mismatch(user, october, income_cat):
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, type="EXPENSE", category_id=income_cat.id))
    assert "category_id" in exc.value.message_dict


@pytest.mark.django_db
def test_create_rejects_inactive_category_and_method(user, october, expense_cat, method):
    expense_cat.is_active = False
    expense_cat.save()
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, category_id=expense_cat.id))
    assert "category_id" in exc.value.message_dict

    method.is_active = False
    method.save()
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, payment_method_id=method.id))
    assert "payment_method_id" in exc.value.message_dict


@pytest.mark.django_db
def test_reactivated_references_selectable_again(user, october, expense_cat, method):
    expense_cat.is_active = method.is_active = False
    expense_cat.save()
    method.save()
    expense_cat.is_active = method.is_active = True
    expense_cat.save()
    method.save()
    t = create_transaction(
        user, _payload(october, category_id=expense_cat.id, payment_method_id=method.id)
    )
    assert t.category == expense_cat and t.payment_method == method


@pytest.mark.django_db
def test_create_rejects_other_users_category_and_method(user, other_user, october):
    foreign_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    foreign_pm = PaymentMethod.objects.create(owner=other_user, name="Cash")
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, category_id=foreign_cat.id))
    assert "category_id" in exc.value.message_dict
    with pytest.raises(ValidationError) as exc:
        create_transaction(user, _payload(october, payment_method_id=foreign_pm.id))
    assert "payment_method_id" in exc.value.message_dict


@pytest.mark.django_db
def test_create_failure_persists_nothing(user, october, income_cat):
    with pytest.raises(ValidationError):
        create_transaction(user, _payload(october, category_id=income_cat.id))
    assert Transaction.all_objects.count() == 0


# ---------------------------------------------------------------------------
# update_transaction
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_update_basic_fields(user, october):
    t = create_transaction(user, _payload(october))
    updated = update_transaction(
        user, t.id, {"amount": Decimal("300.50"), "description": "Updated", "transaction_date": D(2026, 10, 3)}
    )
    updated.refresh_from_db()
    assert updated.amount == Decimal("300.50")
    assert updated.description == "Updated"
    assert updated.transaction_date == D(2026, 10, 3)
    assert updated.book_id == october.id


@pytest.mark.django_db
def test_update_clears_references_with_null(user, october, expense_cat, method):
    t = create_transaction(
        user, _payload(october, category_id=expense_cat.id, payment_method_id=method.id)
    )
    updated = update_transaction(user, t.id, {"category_id": None, "payment_method_id": None})
    assert updated.category is None and updated.payment_method is None


@pytest.mark.django_db
def test_update_type_change_requires_compatible_category(user, october, expense_cat):
    t = create_transaction(user, _payload(october, category_id=expense_cat.id))
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"type": "INCOME"})
    assert "category_id" in exc.value.message_dict
    # Changing both together is valid.
    ok = update_transaction(user, t.id, {"type": "INCOME", "category_id": None})
    assert ok.type == "INCOME"


@pytest.mark.django_db
def test_update_category_type_mismatch(user, october, income_cat):
    t = create_transaction(user, _payload(october))
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"category_id": income_cat.id})
    assert "category_id" in exc.value.message_dict


@pytest.mark.django_db
def test_update_rejects_newly_selected_inactive_references(user, october, expense_cat, method):
    t = create_transaction(user, _payload(october))
    expense_cat.is_active = method.is_active = False
    expense_cat.save()
    method.save()
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"category_id": expense_cat.id})
    assert "category_id" in exc.value.message_dict
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"payment_method_id": method.id})
    assert "payment_method_id" in exc.value.message_dict


@pytest.mark.django_db
def test_update_keeps_existing_inactive_references(user, october, expense_cat, method):
    t = create_transaction(
        user, _payload(october, category_id=expense_cat.id, payment_method_id=method.id)
    )
    expense_cat.is_active = method.is_active = False
    expense_cat.save()
    method.save()
    # Unchanged (omitted) and re-sent-unchanged inactive references are both valid.
    a = update_transaction(user, t.id, {"amount": Decimal("1.00")})
    b = update_transaction(
        user, t.id, {"category_id": expense_cat.id, "payment_method_id": method.id, "amount": Decimal("2.00")}
    )
    assert a.category_id == b.category_id == expense_cat.id
    assert b.payment_method_id == method.id and b.amount == Decimal("2.00")


@pytest.mark.django_db
def test_update_rejects_cross_user_references_and_book(user, other_user, october):
    t = create_transaction(user, _payload(october))
    foreign_cat = Category.objects.create(owner=other_user, name="Food", type="EXPENSE")
    foreign_pm = PaymentMethod.objects.create(owner=other_user, name="Cash")
    foreign_book = create_book(other_user, {"type": BookType.GENERAL, "name": "Theirs"})
    for field, value in (
        ("category_id", foreign_cat.id),
        ("payment_method_id", foreign_pm.id),
        ("book_id", foreign_book.id),
    ):
        with pytest.raises(ValidationError) as exc:
            update_transaction(user, t.id, {field: value})
        assert field in exc.value.message_dict


@pytest.mark.django_db
def test_update_other_users_transaction_does_not_exist(user, other_user, october):
    t = create_transaction(user, _payload(october))
    with pytest.raises(Transaction.DoesNotExist):
        update_transaction(other_user, t.id, {"amount": Decimal("9.00")})
    t.refresh_from_db()
    assert t.amount == Decimal("250.00")


@pytest.mark.django_db
def test_update_monthly_date_move_reassigns_to_target_month_book(user, october):
    t = create_transaction(user, _payload(october))
    assert not Book.objects.filter(owner=user, type=BookType.MONTHLY, year=2026, month=11).exists()
    moved = update_transaction(user, t.id, {"transaction_date": D(2026, 11, 2)})
    november = Book.objects.get(owner=user, type=BookType.MONTHLY, year=2026, month=11)
    assert moved.book_id == november.id
    assert moved.transaction_date == D(2026, 11, 2)


@pytest.mark.django_db
def test_update_monthly_date_move_reuses_existing_target_book(user, october):
    november, _ = ensure_monthly_book(user, 2026, 11)
    t = create_transaction(user, _payload(october))
    moved = update_transaction(user, t.id, {"transaction_date": D(2026, 11, 2)})
    assert moved.book_id == november.id
    assert Book.objects.filter(owner=user, type=BookType.MONTHLY, year=2026, month=11).count() == 1


@pytest.mark.django_db
def test_update_event_book_date_keeps_book(user, event_book):
    t = create_transaction(user, _payload(event_book))
    moved = update_transaction(user, t.id, {"transaction_date": D(2027, 3, 1)})
    assert moved.book_id == event_book.id


@pytest.mark.django_db
def test_update_move_to_other_owned_book(user, october, event_book):
    t = create_transaction(user, _payload(october))
    moved = update_transaction(user, t.id, {"book_id": event_book.id})
    assert moved.book_id == event_book.id


@pytest.mark.django_db
def test_update_move_to_monthly_book_requires_matching_date(user, october, event_book):
    november, _ = ensure_monthly_book(user, 2026, 11)
    t = create_transaction(user, _payload(event_book))
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"book_id": november.id})
    assert "transaction_date" in exc.value.message_dict
    ok = update_transaction(user, t.id, {"book_id": november.id, "transaction_date": D(2026, 11, 3)})
    assert ok.book_id == november.id


@pytest.mark.django_db
def test_update_move_to_archived_book_rejected(user, october, event_book):
    t = create_transaction(user, _payload(october))
    event_book.is_archived = True
    event_book.save()
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"book_id": event_book.id})
    assert "book_id" in exc.value.message_dict


@pytest.mark.django_db
def test_update_in_archived_book_rejected(user, event_book):
    t = create_transaction(user, _payload(event_book))
    event_book.is_archived = True
    event_book.save()
    with pytest.raises(ValidationError) as exc:
        update_transaction(user, t.id, {"amount": Decimal("1.00")})
    assert "detail" in exc.value.message_dict


@pytest.mark.django_db
def test_update_deleted_transaction_does_not_exist(user, october):
    t = create_transaction(user, _payload(october))
    soft_delete_transaction(user, t.id)
    with pytest.raises(Transaction.DoesNotExist):
        update_transaction(user, t.id, {"amount": Decimal("1.00")})


@pytest.mark.django_db
def test_failed_update_rolls_back_month_move(user, october, income_cat):
    t = create_transaction(user, _payload(october))
    with pytest.raises(ValidationError):
        update_transaction(
            user, t.id, {"transaction_date": D(2026, 11, 2), "category_id": income_cat.id}
        )
    t.refresh_from_db()
    assert t.book_id == october.id and t.transaction_date == D(2026, 10, 27)
    # The target-month book creation is rolled back with the failed operation.
    assert not Book.objects.filter(owner=user, type=BookType.MONTHLY, year=2026, month=11).exists()


# ---------------------------------------------------------------------------
# soft_delete_transaction
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_soft_delete_sets_deleted_at_and_keeps_row(user, october):
    t = create_transaction(user, _payload(october))
    soft_delete_transaction(user, t.id)
    row = Transaction.all_objects.get(pk=t.id)
    assert row.deleted_at is not None


@pytest.mark.django_db
def test_soft_delete_is_idempotent_and_preserves_timestamp(user, october):
    t = create_transaction(user, _payload(october))
    soft_delete_transaction(user, t.id)
    first = Transaction.all_objects.get(pk=t.id).deleted_at
    soft_delete_transaction(user, t.id)
    assert Transaction.all_objects.get(pk=t.id).deleted_at == first


@pytest.mark.django_db
def test_soft_delete_other_users_transaction_does_not_exist(user, other_user, october):
    t = create_transaction(user, _payload(october))
    with pytest.raises(Transaction.DoesNotExist):
        soft_delete_transaction(other_user, t.id)
    assert Transaction.objects.filter(pk=t.id).exists()


@pytest.mark.django_db
def test_soft_delete_in_archived_book_rejected(user, event_book):
    t = create_transaction(user, _payload(event_book))
    event_book.is_archived = True
    event_book.save()
    with pytest.raises(ValidationError):
        soft_delete_transaction(user, t.id)
    assert Transaction.objects.filter(pk=t.id).exists()
