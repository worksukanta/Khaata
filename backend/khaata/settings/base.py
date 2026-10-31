"""
Khaata base settings.

All environment-specific settings must be placed in a separate file that
imports from this module (e.g. settings/development.py, settings/production.py).
Do NOT use this file directly as DJANGO_SETTINGS_MODULE.
"""
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# BASE_DIR is the backend/ directory (parent of the khaata/ package).
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    # Khaata apps
    "khaata.apps.accounts",
    "khaata.apps.books",
    "khaata.apps.transactions",
    "khaata.apps.budgets",
    "khaata.apps.reports",
    "khaata.apps.exports",
    "khaata.apps.health",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "khaata.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "khaata.wsgi.application"

# ---------------------------------------------------------------------------
# Custom user model — must be declared before the first migration.
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
USE_I18N = True
USE_TZ = True  # All datetimes stored as UTC; use user timezone for display.

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"

# ---------------------------------------------------------------------------
# Default primary key type
# ---------------------------------------------------------------------------
# Domain models use explicit UUIDField PKs; this default applies to
# Django's built-in tables (admin log, etc.) only.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Session / CSRF cookies (ADR-008)
# ---------------------------------------------------------------------------
# Secure-by-default: cookies are HTTPS-only unless an environment-specific
# settings module (development.py / test.py) explicitly relaxes them for local
# HTTP. A future production settings module therefore cannot accidentally
# inherit insecure cookies.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = True
# The SPA reads the csrftoken cookie and sends it as X-CSRFToken, so the CSRF
# cookie must NOT be HttpOnly (API_CONTRACT.md section 1).
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True

# ---------------------------------------------------------------------------
# Django REST Framework defaults
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "MAX_PAGE_SIZE": 100,
    "EXCEPTION_HANDLER": "khaata.core.exceptions.custom_exception_handler",
}
