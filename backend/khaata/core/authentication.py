"""
Authentication helpers for Khaata REST API.
"""
from rest_framework.authentication import SessionAuthentication


class CsrfEnforcedAnonymousAuthentication(SessionAuthentication):
    """
    Enforce Django's CSRF check for endpoints that must be reachable without a
    session (login, registration).

    DRF's ``APIView.as_view()`` marks views ``csrf_exempt`` and
    ``SessionAuthentication`` only enforces CSRF for *authenticated* requests,
    so anonymous state-changing endpoints would otherwise skip CSRF entirely
    (login CSRF). This class always runs the CSRF check and never authenticates
    anybody itself; failures raise ``PermissionDenied`` (HTTP 403) which the
    custom exception handler renders in the standard error envelope.
    """

    def authenticate(self, request):
        self.enforce_csrf(request)
        return None
