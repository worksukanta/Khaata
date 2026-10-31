"""
Khaata CI settings for the PostgreSQL test job.

Used exclusively by GitHub Actions (BOOT-002). Reads PostgreSQL connection
details from the standard DB_* environment variables set by the service
container step — no python-decouple, no .env file required.

All security settings are relaxed (DEBUG=False, no HTTPS cookies) because
this runs in an isolated CI environment, not production.
"""
import os

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]

TIME_ZONE = "Asia/Kolkata"

# ---------------------------------------------------------------------------
# Database — PostgreSQL via service container environment variables
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": os.environ["DB_HOST"],
        "PORT": os.environ.get("DB_PORT", "5432"),
        "NAME": os.environ["DB_NAME"],
        "USER": os.environ["DB_USER"],
        "PASSWORD": os.environ["DB_PASSWORD"],
    }
}

# ---------------------------------------------------------------------------
# Security — relaxed for CI (no HTTPS in the service container network)
# ---------------------------------------------------------------------------
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173"]
