"""
Tests for development settings logic.

Verifies the documented SQLite fallback and partial PostgreSQL config detection.
These tests import the settings module directly and patch os.environ, so they
do not require a live database.
"""
import os
import sys

import pytest


def _reload_dev_settings(env_vars: dict):
    """
    Reload khaata.settings.development with a controlled environment.

    Temporarily replaces os.environ, purges cached module state so
    python-decouple re-reads the env, then restores everything.
    """
    # Modules that cache config at import time must be purged.
    modules_to_purge = [
        key for key in sys.modules
        if key.startswith("khaata.settings") or key == "decouple"
    ]
    for mod in modules_to_purge:
        sys.modules.pop(mod, None)

    original_env = os.environ.copy()
    # Clear current env; apply only the provided vars.
    os.environ.clear()
    # Always need DJANGO_SECRET_KEY so the module doesn't raise on that line.
    os.environ["DJANGO_SECRET_KEY"] = "test-only-key"
    os.environ.update(env_vars)

    try:
        import khaata.settings.development as dev_settings
        return dev_settings
    finally:
        # Restore environment and module cache.
        os.environ.clear()
        os.environ.update(original_env)
        for mod in list(sys.modules.keys()):
            if mod.startswith("khaata.settings") or mod == "decouple":
                sys.modules.pop(mod, None)


def test_sqlite_fallback_when_no_pg_vars():
    """No PostgreSQL variables → SQLite engine selected."""
    settings = _reload_dev_settings({})
    engine = settings.DATABASES["default"]["ENGINE"]
    assert engine == "django.db.backends.sqlite3"


def test_sqlite_fallback_uses_db_sqlite3_filename():
    """SQLite fallback uses db.sqlite3 in BASE_DIR."""
    settings = _reload_dev_settings({})
    name = settings.DATABASES["default"]["NAME"]
    # Should end with db.sqlite3 (Path object or string).
    assert str(name).endswith("db.sqlite3")


def test_full_pg_config_uses_postgresql_engine():
    """All five PostgreSQL variables present → PostgreSQL engine selected."""
    settings = _reload_dev_settings({
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "khaata",
        "DB_USER": "khaata",
        "DB_PASSWORD": "khaata",
    })
    engine = settings.DATABASES["default"]["ENGINE"]
    assert engine == "django.db.backends.postgresql"


def test_partial_pg_config_raises_runtime_error():
    """
    Providing only some PostgreSQL variables must raise RuntimeError so that a
    partial misconfiguration is never silently ignored or falls back to SQLite.
    """
    with pytest.raises(RuntimeError, match="Partial PostgreSQL configuration"):
        _reload_dev_settings({
            "DB_HOST": "localhost",
            # DB_PORT, DB_NAME, DB_USER, DB_PASSWORD intentionally absent.
        })
