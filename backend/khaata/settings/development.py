"""
Khaata development settings.

Reads configuration from the environment (or a local .env file).
Set DJANGO_SETTINGS_MODULE=khaata.settings.development to use this file.

Database behaviour
------------------
* If all five PostgreSQL variables (DB_HOST, DB_PORT, DB_NAME, DB_USER,
  DB_PASSWORD) are present, the app connects to PostgreSQL.
* If NONE of them are present, a local SQLite database is used as a
  convenience fallback for developers who do not have PostgreSQL running.
* If SOME (but not all) are present, startup is intentionally blocked with
  an error so that a partial misconfiguration is never silently ignored.

Copy .env.example to .env, fill in your values, and activate the venv
before running management commands.
"""
from pathlib import Path

from decouple import Csv, config

from .base import *  # noqa: F401, F403

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = config("DJANGO_SECRET_KEY")
DEBUG = config("DJANGO_DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ---------------------------------------------------------------------------
# Timezone
# ---------------------------------------------------------------------------
TIME_ZONE = config("TIME_ZONE", default="Asia/Kolkata")

# ---------------------------------------------------------------------------
# Database — PostgreSQL with documented SQLite fallback
# ---------------------------------------------------------------------------
_PG_VARS = {
    "DB_HOST": config("DB_HOST", default=None),
    "DB_PORT": config("DB_PORT", default=None),
    "DB_NAME": config("DB_NAME", default=None),
    "DB_USER": config("DB_USER", default=None),
    "DB_PASSWORD": config("DB_PASSWORD", default=None),
}
_pg_provided = {k: v for k, v in _PG_VARS.items() if v is not None}
_pg_missing = {k for k in _PG_VARS if k not in _pg_provided}

if not _pg_provided:
    # No PostgreSQL variables set at all — use SQLite for local development.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
elif _pg_missing:
    # Partial configuration — fail loudly rather than silently use SQLite.
    raise RuntimeError(
        "Partial PostgreSQL configuration detected. "
        f"Missing variables: {', '.join(sorted(_pg_missing))}. "
        "Either provide all five (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) "
        "or none of them to use the SQLite development fallback."
    )
else:
    # Full PostgreSQL configuration provided.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": _PG_VARS["DB_HOST"],
            "PORT": _PG_VARS["DB_PORT"],
            "NAME": _PG_VARS["DB_NAME"],
            "USER": _PG_VARS["DB_USER"],
            "PASSWORD": _PG_VARS["DB_PASSWORD"],
        }
    }

# ---------------------------------------------------------------------------
# Security (relaxed for local development only)
# ---------------------------------------------------------------------------
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=False, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=False, cast=bool)

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:5173",
    cast=Csv(),
)
