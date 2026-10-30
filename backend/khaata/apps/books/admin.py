"""
Admin configuration for Books.
"""
from django.contrib import admin

from khaata.apps.books.models import Book


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "owner", "year", "month", "is_archived", "created_at")
    list_filter = ("type", "is_archived", "year", "month")
    search_fields = ("name", "description", "owner__email")
    readonly_fields = ("id", "created_at", "updated_at")
