"""
URL routing for Books API endpoints.
"""
from django.urls import path

from khaata.apps.books.views import (
    BookArchiveView,
    BookDetailView,
    BookListCreateView,
    BookRestoreView,
    MonthlyBookEnsureView,
)

urlpatterns = [
    path("", BookListCreateView.as_view(), name="book-list-create"),
    path(
        "monthly/<int:year>/<int:month>/ensure/",
        MonthlyBookEnsureView.as_view(),
        name="book-monthly-ensure",
    ),
    path("<uuid:id>/", BookDetailView.as_view(), name="book-detail"),
    path("<uuid:id>/archive/", BookArchiveView.as_view(), name="book-archive"),
    path("<uuid:id>/restore/", BookRestoreView.as_view(), name="book-restore"),
]
