"""
Admin configuration for categories, payment methods and transactions.
"""
from django.contrib import admin

from khaata.apps.transactions.models import Category, PaymentMethod, Transaction


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "owner", "is_default", "is_active", "created_at")
    list_filter = ("type", "is_default", "is_active")
    search_fields = ("name", "owner__email")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "owner__email")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("transaction_date", "type", "amount", "book", "category", "deleted_at")
    list_filter = ("type",)
    search_fields = ("description", "book__owner__email")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("book", "category", "payment_method")

    def get_queryset(self, request):
        # Audit/admin view includes soft-deleted rows.
        return Transaction.all_objects.select_related("book", "category")
