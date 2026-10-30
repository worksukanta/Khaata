"""
Unit tests for custom exception handler (khaata.core.exceptions).
"""
import pytest
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response

from khaata.core.exceptions import custom_exception_handler


def test_custom_exception_handler_returns_none_for_unhandled():
    """Unhandled standard exceptions return None to allow standard 500 handling."""
    exc = ZeroDivisionError("division by zero")
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is None


def test_custom_exception_handler_validation_error_dict():
    """ValidationError with dict details is formatted properly."""
    exc = exceptions.ValidationError({"email": ["Invalid email."]})
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data == {
        "error": {
            "code": "validation_error",
            "message": "The request contains invalid fields.",
            "details": {"email": ["Invalid email."]},
        }
    }


def test_custom_exception_handler_validation_error_list():
    """ValidationError with list details wraps in non_field_errors."""
    exc = exceptions.ValidationError(["Something went wrong."])
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data == {
        "error": {
            "code": "validation_error",
            "message": "The request contains invalid fields.",
            "details": {"non_field_errors": ["Something went wrong."]},
        }
    }


def test_custom_exception_handler_not_authenticated():
    """NotAuthenticated exception formatted as not_authenticated error."""
    exc = exceptions.NotAuthenticated()
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.data == {
        "error": {
            "code": "not_authenticated",
            "message": "Authentication credentials were not provided.",
            "details": {},
        }
    }


def test_custom_exception_handler_authentication_failed():
    """AuthenticationFailed exception formatted as authentication_failed error."""
    exc = exceptions.AuthenticationFailed("Invalid email or password.")
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.data == {
        "error": {
            "code": "authentication_failed",
            "message": "Invalid email or password.",
            "details": {},
        }
    }


def test_custom_exception_handler_permission_denied():
    """PermissionDenied exception formatted as permission_denied error."""
    exc = exceptions.PermissionDenied()
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {
        "error": {
            "code": "permission_denied",
            "message": "You do not have permission to perform this action.",
            "details": {},
        }
    }


def test_custom_exception_handler_not_found():
    """NotFound exception formatted as not_found error."""
    exc = exceptions.NotFound()
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {
        "error": {
            "code": "not_found",
            "message": "Not found.",
            "details": {},
        }
    }


def test_custom_exception_handler_django_http404():
    """Django Http404 exception formatted as not_found error."""
    exc = Http404("Item not found.")
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {
        "error": {
            "code": "not_found",
            "message": "Item not found.",
            "details": {},
        }
    }


def test_custom_exception_handler_method_not_allowed():
    """MethodNotAllowed exception formatted as method_not_allowed error."""
    exc = exceptions.MethodNotAllowed("POST")
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert response.data == {
        "error": {
            "code": "method_not_allowed",
            "message": 'Method "POST" not allowed.',
            "details": {},
        }
    }


def test_custom_exception_handler_throttled():
    """Throttled exception formatted as throttled error."""
    exc = exceptions.Throttled(wait=60)
    context = {}
    response = custom_exception_handler(exc, context)
    assert response is not None
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.data["error"]["code"] == "throttled"
    assert response.data["error"]["details"] == {}
