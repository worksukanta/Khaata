"""
Health check view.

GET /api/v1/health/ — returns a minimal JSON response confirming the
application is running. Does NOT expose credentials, environment variables,
stack traces, or any internal state. No authentication required so that
infrastructure monitoring tools can reach it without a session.
"""
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """
    Returns a simple liveness indicator.

    Response body::

        {"status": "ok"}

    HTTP 200 only; any other status code indicates the application failed
    to start or is unreachable.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})
