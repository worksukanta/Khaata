"""
Project-level error views.

Unknown ``/api/`` routes and unexpected server errors return the documented
JSON error envelope instead of Django's HTML pages. Non-API paths (e.g. the
admin site) keep Django's default behaviour. No exception text or stack trace
is ever included.
"""
from django.http import JsonResponse
from django.views import defaults


def _is_api(request):
    return request.path.startswith("/api/")


def handler404(request, exception=None):
    if not _is_api(request):
        return defaults.page_not_found(request, exception)
    return JsonResponse(
        {"error": {"code": "not_found", "message": "Not found.", "details": {}}},
        status=404,
    )


def handler500(request):
    if not _is_api(request):
        return defaults.server_error(request)
    return JsonResponse(
        {
            "error": {
                "code": "server_error",
                "message": "An unexpected error occurred.",
                "details": {},
            }
        },
        status=500,
    )
