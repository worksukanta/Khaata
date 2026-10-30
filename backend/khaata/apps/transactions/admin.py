"""
Admin configuration for categories and payment methods.
"""
from django.contrib import admin

from khaata.apps.transactions.models import Category, PaymentMethod


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
