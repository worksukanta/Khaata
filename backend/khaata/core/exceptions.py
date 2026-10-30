"""
Custom exception handler for Khaata REST API.

Formats all error responses into the standard documented shape:
{
  "error": {
    "code": "<string>",
    "message": "<string>",
    "details": { ... }
  }
}
"""
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """
    Call DRF's default exception handler first, then normalize response.data
    to the Khaata error shape.
    """
    response = exception_handler(exc, context)

    if response is None:
        return None

    # If already formatted in Khaata error shape, return as-is
    if isinstance(response.data, dict) and "error" in response.data:
        return response

    code = "error"
    message = "An error occurred."
    details = {}

    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
        message = "The request contains invalid fields."
        if isinstance(response.data, dict):
            details = response.data
        elif isinstance(response.data, list):
            details = {"non_field_errors": response.data}
        else:
            details = {"detail": [str(response.data)]}

    elif isinstance(exc, exceptions.NotAuthenticated):
        code = "not_authenticated"
        message = (
            str(response.data.get("detail", "Authentication credentials were not provided."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}
        response.status_code = status.HTTP_401_UNAUTHORIZED

    elif isinstance(exc, exceptions.AuthenticationFailed):
        code = getattr(exc, "code", None) or getattr(exc, "default_code", "authentication_failed")
        message = (
            str(response.data.get("detail", "Authentication failed."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}
        response.status_code = status.HTTP_401_UNAUTHORIZED

    elif isinstance(exc, (exceptions.PermissionDenied, DjangoPermissionDenied)):
        code = "permission_denied"
        message = (
            str(response.data.get("detail", "You do not have permission to perform this action."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}

    elif isinstance(exc, (exceptions.NotFound, Http404)):
        code = "not_found"
        message = (
            str(response.data.get("detail", "Resource not found."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}

    elif isinstance(exc, exceptions.MethodNotAllowed):
        code = "method_not_allowed"
        message = (
            str(response.data.get("detail", "Method not allowed."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}

    elif isinstance(exc, exceptions.Throttled):
        code = "throttled"
        message = (
            str(response.data.get("detail", "Request was throttled."))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = {}

    else:
        code = getattr(exc, "default_code", "error")
        if isinstance(response.data, dict):
            if "detail" in response.data:
                message = str(response.data["detail"])
            else:
                message = "The request could not be processed."
                details = response.data
        else:
            message = str(response.data)

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }

    return response
