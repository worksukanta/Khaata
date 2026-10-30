"""
Views for Books API.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.apps.books.models import Book, BookType
from khaata.apps.books.serializers import (
    BookSerializer,
    CreateBookSerializer,
    UpdateBookSerializer,
)
from khaata.apps.books.services import (
    archive_book,
    create_book,
    ensure_monthly_book,
    restore_book,
    update_book,
)


class BookListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/books/
        List and filter the authenticated user's books.
        Query params:
        - type: MONTHLY | EVENT | GENERAL
        - search: substring match on name or description
        - is_archived: true | false
        - ordering: name | -name | created_at | -created_at

    POST /api/v1/books/
        Create an EVENT or GENERAL book.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = BookSerializer

    def get_queryset(self):
        queryset = Book.objects.filter(owner=self.request.user)

        # Filter by type
        book_type = self.request.query_params.get("type")
        if book_type:
            book_type_upper = book_type.upper()
            if book_type_upper in BookType.values:
                queryset = queryset.filter(type=book_type_upper)
            else:
                queryset = queryset.none()

        # Filter by search term
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )

        # Filter by archive status
        is_archived = self.request.query_params.get("is_archived")
        if is_archived is not None:
            if is_archived.lower() in ["true", "1"]:
                queryset = queryset.filter(is_archived=True)
            elif is_archived.lower() in ["false", "0"]:
                queryset = queryset.filter(is_archived=False)

        # Ordering
        ordering = self.request.query_params.get("ordering")
        allowed_orderings = ["name", "-name", "created_at", "-created_at"]
        if ordering in allowed_orderings:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by("-created_at")

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = CreateBookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            book = create_book(request.user, serializer.validated_data)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

        output_serializer = BookSerializer(book)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class MonthlyBookEnsureView(APIView):
    """
    POST /api/v1/books/monthly/{year}/{month}/ensure/
        Idempotently create or retrieve the authenticated user's monthly book.
        Returns 201 if created, 200 if already present.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, year: int, month: int):
        if not (2000 <= year <= 2200):
            raise ValidationError({"year": ["Year must be between 2000 and 2200."]})
        if not (1 <= month <= 12):
            raise ValidationError({"month": ["Month must be between 1 and 12."]})

        try:
            book, created = ensure_monthly_book(request.user, year, month)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

        serializer = BookSerializer(book)
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=response_status)


class BookDetailView(APIView):
    """
    GET /api/v1/books/{id}/
        Retrieve an owned book.

    PATCH /api/v1/books/{id}/
        Update editable metadata for an owned EVENT or GENERAL book.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(Book, id=pk, owner=self.request.user)

    def get(self, request, id):
        book = self.get_object(id)
        serializer = BookSerializer(book)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, id):
        book = self.get_object(id)
        serializer = UpdateBookSerializer(instance=book, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_book(book, serializer.validated_data)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

        output_serializer = BookSerializer(updated)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class BookArchiveView(APIView):
    """
    POST /api/v1/books/{id}/archive/
        Archive an owned EVENT or GENERAL book.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        book = get_object_or_404(Book, id=id, owner=request.user)
        try:
            archived = archive_book(book)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

        serializer = BookSerializer(archived)
        return Response(serializer.data, status=status.HTTP_200_OK)


class BookRestoreView(APIView):
    """
    POST /api/v1/books/{id}/restore/
        Restore an archived EVENT or GENERAL book.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        book = get_object_or_404(Book, id=id, owner=request.user)
        try:
            restored = restore_book(book)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

        serializer = BookSerializer(restored)
        return Response(serializer.data, status=status.HTTP_200_OK)
