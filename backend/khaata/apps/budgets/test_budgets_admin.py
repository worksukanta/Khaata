"""
Admin validation tests for Budget/BudgetAllocation (BE-006 final review).

These tests verify that the allocation cap invariant
    sum(allocations) <= budget.total_limit
is enforced when changes are made through the Django admin, not only through
the API. Two test layers are included:

1. **Unit tests for BudgetAllocationFormSet.clean()** — exercise the formset
   directly without an HTTP request, covering the aggregate rule, partial
   deletions, and the edge case where the total equals the limit (allowed).

2. **Integration tests via Django test client** — POST to the real admin
   change-view URL, verifying that an over-cap submission is rejected (HTTP 200
   with form errors, no DB mutation) and that a valid submission saves.

Database: SQLite in-memory (test.py settings). PostgreSQL is not exercised.
"""
import uuid
from decimal import Decimal

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.urls import reverse

from khaata.apps.books.models import BookType
from khaata.apps.books.services import create_book
from khaata.apps.budgets.admin import BudgetAdmin, BudgetAllocationFormSet
from khaata.apps.budgets.models import Budget, BudgetAllocation, BudgetScope
from khaata.apps.budgets.services import create_budget, replace_allocations
from khaata.apps.transactions.models import Category

User = get_user_model()
D = Decimal


# ---------------------------------------------------------------------------
# Shared helpers / fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def superuser():
    return User.objects.create_superuser(
        email="admin@example.com", password="AdminPassword123!"
    )


@pytest.fixture
def regular_user():
    return User.objects.create_user(
        email="owner@example.com", password="SecurePassword123!"
    )


@pytest.fixture
def food(regular_user):
    return Category.objects.create(owner=regular_user, name="Food", type="EXPENSE")


@pytest.fixture
def travel(regular_user):
    return Category.objects.create(owner=regular_user, name="Travel", type="EXPENSE")


@pytest.fixture
def budget(regular_user):
    """Monthly budget with a 1000.00 limit, no allocations."""
    return create_budget(
        regular_user,
        {
            "scope": BudgetScope.MONTHLY_OVERALL,
            "year": 2026,
            "month": 10,
            "total_limit": D("1000.00"),
        },
    )


@pytest.fixture
def admin_client(client, superuser):
    client.force_login(superuser)
    return client


# ---------------------------------------------------------------------------
# Helper: build formset POST data that Django admin / formsets expect
# ---------------------------------------------------------------------------

def _inline_post_data(budget, rows, management_extra=None):
    """
    Build a POST data dict for the BudgetAllocation inline.

    ``rows`` is a list of dicts with keys:
      - ``id``: existing allocation pk (str/UUID) or empty string for new rows
      - ``category``: category pk (str/UUID)
      - ``amount``: amount string
      - ``DELETE``: bool (optional, defaults to False)

    ``management_extra`` overrides specific management form fields.
    """
    total_count = len(rows)
    prefix = "allocations"  # Django admin inline prefix = model name lowercased

    data = {
        f"{prefix}-TOTAL_FORMS": str(total_count),
        f"{prefix}-INITIAL_FORMS": str(sum(1 for r in rows if r.get("id"))),
        f"{prefix}-MIN_NUM_FORMS": "0",
        f"{prefix}-MAX_NUM_FORMS": "1000",
    }
    if management_extra:
        data.update(management_extra)

    for i, row in enumerate(rows):
        data[f"{prefix}-{i}-id"] = str(row.get("id", ""))
        data[f"{prefix}-{i}-budget"] = str(budget.pk)
        data[f"{prefix}-{i}-category"] = str(row.get("category", ""))
        data[f"{prefix}-{i}-amount"] = str(row.get("amount", ""))
        if row.get("DELETE"):
            data[f"{prefix}-{i}-DELETE"] = "on"

    return data


def _budget_change_post_data(budget, alloc_rows):
    """
    Full POST payload for the Budget admin change view (parent + inline rows).
    """
    data = {
        # Parent Budget fields (required by the form)
        "owner": str(budget.owner_id),
        "scope": budget.scope,
        "year": str(budget.year) if budget.year is not None else "",
        "month": str(budget.month) if budget.month is not None else "",
        "book": str(budget.book_id) if budget.book_id is not None else "",
        "total_limit": str(budget.total_limit),
        "_save": "Save",
    }
    data.update(_inline_post_data(budget, alloc_rows))
    return data


# ---------------------------------------------------------------------------
# 1. Unit tests — BudgetAllocationFormSet.clean()
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBudgetAllocationFormSetClean:
    """
    Direct formset unit tests. We construct the formset with ``data`` matching
    what Django admin would supply, bind it to a Budget instance, and call
    ``is_valid()`` / ``errors``.
    """

    def _make_formset(self, budget, rows):
        """Return a bound formset for the given budget and row specs."""
        from django.forms import inlineformset_factory

        FormSetClass = inlineformset_factory(
            Budget,
            BudgetAllocation,
            formset=BudgetAllocationFormSet,
            fields=["category", "amount"],
            extra=0,
            can_delete=True,
        )
        post_data = _inline_post_data(budget, rows)
        return FormSetClass(post_data, instance=budget, prefix="allocations")

    def test_total_within_limit_is_valid(self, budget, food, travel):
        """400.00 + 500.00 = 900.00 <= 1000.00 — must pass."""
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "400.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        assert fs.is_valid(), fs.errors

    def test_total_equal_to_limit_is_valid(self, budget, food, travel):
        """500.00 + 500.00 = 1000.00 == 1000.00 — exact cap is allowed."""
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "500.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        assert fs.is_valid(), fs.errors

    def test_total_exceeds_limit_raises_non_field_error(self, budget, food, travel):
        """600.00 + 500.00 = 1100.00 > 1000.00 — must be rejected."""
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "600.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        assert not fs.is_valid()
        non_field = fs.non_form_errors()
        assert len(non_field) == 1
        assert "1100" in non_field[0] or "exceeds" in non_field[0].lower()

    def test_deleted_rows_excluded_from_total(self, budget, food, travel):
        """
        food 600 is marked DELETE; travel 500 remains → total 500 <= 1000.
        Must pass even though the raw sum would be 1100.
        """
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "600.00", "DELETE": True},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        assert fs.is_valid(), fs.errors

    def test_deleted_rows_still_over_cap_rejected(self, budget, food, travel):
        """
        Even after ignoring a deleted row, the remaining total exceeds the cap.
        food 200 (DELETE) + travel 1100 → travel alone 1100 > 1000.
        """
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "200.00", "DELETE": True},
                {"category": travel.pk, "amount": "1100.00"},
            ],
        )
        assert not fs.is_valid()
        assert fs.non_form_errors()

    def test_empty_formset_is_valid(self, budget):
        """No allocations submitted — total 0 <= any positive limit."""
        fs = self._make_formset(budget, [])
        assert fs.is_valid(), fs.errors

    def test_limit_zero_with_nonzero_allocation_rejected(self, regular_user):
        """A budget with total_limit=0 must not accept any positive allocation."""
        zero_budget = create_budget(
            regular_user,
            {
                "scope": BudgetScope.MONTHLY_OVERALL,
                "year": 2025,
                "month": 1,
                "total_limit": D("0.00"),
            },
        )
        food = Category.objects.create(owner=regular_user, name="FoodZ", type="EXPENSE")
        from django.forms import inlineformset_factory

        FormSetClass = inlineformset_factory(
            Budget,
            BudgetAllocation,
            formset=BudgetAllocationFormSet,
            fields=["category", "amount"],
            extra=0,
            can_delete=True,
        )
        post_data = _inline_post_data(zero_budget, [{"category": food.pk, "amount": "1.00"}])
        fs = FormSetClass(post_data, instance=zero_budget, prefix="allocations")
        assert not fs.is_valid()
        assert fs.non_form_errors()

    def test_multi_row_partial_deletion_exactly_at_cap(self, budget, food, travel):
        """
        Three rows submitted: food 400 (keep), travel 600 (keep), third 100
        (DELETE). Kept total = 1000 == limit. Must pass.
        """
        third_cat = Category.objects.create(owner=budget.owner, name="Other", type="EXPENSE")
        fs = self._make_formset(
            budget,
            [
                {"category": food.pk, "amount": "400.00"},
                {"category": travel.pk, "amount": "600.00"},
                {"category": third_cat.pk, "amount": "100.00", "DELETE": True},
            ],
        )
        assert fs.is_valid(), fs.errors


# ---------------------------------------------------------------------------
# 2. Integration tests — Django admin change view (HTTP POST)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBudgetAdminChangeViewAllocation:
    """
    End-to-end tests through Django's admin change view.

    A superuser submits the Budget change form (including inline allocation rows).
    We verify:
    - A valid submission (total <= limit) saves and redirects.
    - An over-cap submission is rejected (HTTP 200, no DB mutation, error message
      present in the response body).
    """

    def _change_url(self, budget):
        return reverse(
            "admin:budgets_budget_change", kwargs={"object_id": str(budget.pk)}
        )

    def test_admin_valid_allocation_saves(self, admin_client, budget, food, travel):
        """400 + 500 = 900 <= 1000 — change view must redirect to changelist."""
        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [
                {"category": food.pk, "amount": "400.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        response = admin_client.post(url, data=post_data)
        # Successful save redirects (302) to the changelist.
        assert response.status_code == 302, (
            f"Expected redirect, got {response.status_code}. "
            f"Form errors may be present."
        )
        assert BudgetAllocation.objects.filter(budget=budget).count() == 2

    def test_admin_allocation_at_cap_saves(self, admin_client, budget, food, travel):
        """500 + 500 = 1000 == limit — exact cap must be accepted."""
        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [
                {"category": food.pk, "amount": "500.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        response = admin_client.post(url, data=post_data)
        assert response.status_code == 302
        assert BudgetAllocation.objects.filter(budget=budget).count() == 2

    def test_admin_allocation_exceeds_cap_rejected(self, admin_client, budget, food, travel):
        """
        600 + 500 = 1100 > 1000 — the change view must return HTTP 200
        (re-rendered form with errors) and leave the database unchanged.
        """
        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [
                {"category": food.pk, "amount": "600.00"},
                {"category": travel.pk, "amount": "500.00"},
            ],
        )
        response = admin_client.post(url, data=post_data)
        # Admin re-renders the form on error, not a redirect.
        assert response.status_code == 200
        content = response.content.decode()
        assert "exceeds" in content.lower() or "total limit" in content.lower()
        # No allocations must have been saved.
        assert BudgetAllocation.objects.filter(budget=budget).count() == 0

    def test_admin_single_allocation_exceeds_cap_rejected(self, admin_client, budget, food):
        """A single allocation above the total limit must be rejected."""
        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [{"category": food.pk, "amount": "1500.00"}],
        )
        response = admin_client.post(url, data=post_data)
        assert response.status_code == 200
        assert BudgetAllocation.objects.filter(budget=budget).count() == 0

    def test_admin_existing_allocation_update_exceeds_cap_rejected(
        self, admin_client, budget, food, travel
    ):
        """
        Existing allocation food=400 is updated to food=900 while travel=300
        remains. Total becomes 1200 > 1000 — must be rejected, old values kept.
        """
        # Seed existing allocations via the service layer.
        replace_allocations(
            budget.owner,
            budget.pk,
            [
                {"category_id": food.pk, "amount": D("400.00")},
                {"category_id": travel.pk, "amount": D("300.00")},
            ],
        )
        food_alloc = BudgetAllocation.objects.get(budget=budget, category=food)
        travel_alloc = BudgetAllocation.objects.get(budget=budget, category=travel)

        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [
                {"id": food_alloc.pk, "category": food.pk, "amount": "900.00"},
                {"id": travel_alloc.pk, "category": travel.pk, "amount": "300.00"},
            ],
        )
        response = admin_client.post(url, data=post_data)
        assert response.status_code == 200
        # Amounts must remain at their original values.
        food_alloc.refresh_from_db()
        travel_alloc.refresh_from_db()
        assert food_alloc.amount == D("400.00")
        assert travel_alloc.amount == D("300.00")

    def test_admin_delete_one_row_brings_total_within_cap(
        self, admin_client, budget, food, travel
    ):
        """
        Start from a valid state: food=600, travel=300 (total 900 <= 1000).
        Admin submission marks travel for deletion → remaining total 600 <=
        1000 → must save and leave only the food allocation.
        """
        replace_allocations(
            budget.owner,
            budget.pk,
            [
                {"category_id": food.pk, "amount": D("600.00")},
                {"category_id": travel.pk, "amount": D("300.00")},
            ],
        )
        food_alloc = BudgetAllocation.objects.get(budget=budget, category=food)
        travel_alloc = BudgetAllocation.objects.get(budget=budget, category=travel)

        url = self._change_url(budget)
        post_data = _budget_change_post_data(
            budget,
            [
                {"id": food_alloc.pk, "category": food.pk, "amount": "600.00"},
                {"id": travel_alloc.pk, "category": travel.pk, "amount": "300.00", "DELETE": True},
            ],
        )
        response = admin_client.post(url, data=post_data)
        assert response.status_code == 302
        assert BudgetAllocation.objects.filter(budget=budget).count() == 1
        assert BudgetAllocation.objects.filter(budget=budget, category=food).exists()

    def test_admin_unauthenticated_redirects_to_login(self, client, budget):
        """Unauthenticated request to admin change view redirects to login."""
        url = self._change_url(budget)
        response = client.get(url)
        assert response.status_code == 302
        assert "/login/" in response["Location"] or "login" in response["Location"].lower()
