"""
Views for authentication and user account management.
"""
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from khaata.core.authentication import CsrfEnforcedAnonymousAuthentication

from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """
    Bootstrap CSRF cookie endpoint.
    GET /api/v1/auth/csrf/
    Sets the csrftoken cookie and returns a confirmation payload.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        get_token(request)
        return Response({"detail": "CSRF cookie set."}, status=status.HTTP_200_OK)


class RegisterView(APIView):
    """
    User registration endpoint.
    POST /api/v1/auth/register/
    Creates a new user account without automatically authenticating the session.
    CSRF-protected (anonymous state-changing request).
    """

    authentication_classes = [CsrfEnforcedAnonymousAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """
    User login endpoint.
    POST /api/v1/auth/login/
    Authenticates user credentials and establishes a server-side session.
    CSRF-protected to prevent login CSRF.
    """

    authentication_classes = [CsrfEnforcedAnonymousAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        password = serializer.validated_data["password"]

        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            raise AuthenticationFailed(
                detail="Invalid email or password.",
                code="authentication_failed",
            )

        login(request, user)
        return Response({"detail": "Login successful."}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    User logout endpoint.
    POST /api/v1/auth/logout/
    Terminates the current session and clears session state.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    """
    Current user profile endpoint.
    GET /api/v1/auth/me/ - Retrieve authenticated user's details.
    PATCH /api/v1/auth/me/ - Update profile preferences (display_name, timezone).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        serializer = UserUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
