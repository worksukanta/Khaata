"""
Khaata test settings.

Uses SQLite in-memory so tests run without any external service.
Used automatically by pytest via pytest.ini / conftest.
"""
from .base import *  # noqa: F401, F403

SECRET_KEY = "test-secret-key-not-for-production-use-only"
DEBUG = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]

TIME_ZONE = "Asia/Kolkata"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173"]
