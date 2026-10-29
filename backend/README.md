# Khaata — Backend

Django + Django REST Framework backend for the Khaata personal finance tracker.

## Requirements

- Python 3.12+ (developed and tested on Python 3.14; requires Django 5.2+ for Python 3.14 compatibility)
- PostgreSQL (production / full dev setup) — or nothing (SQLite fallback for quick local dev)

---

## Setup

### 1. Create and activate a virtual environment

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

Development (includes test dependencies):

```bash
pip install -r requirements-dev.txt
```

Production:

```bash
pip install -r requirements.txt
```

### 3. Configure the environment

Copy the example file and fill in your values. **Never commit `.env`.**

```bash
cp ../.env.example .env   # from the repository root
# or
copy ..\\.env.example .env  # Windows
```

Edit `.env` with your local values (see [Environment variables](#environment-variables) below).

### 4. Apply migrations

```bash
python manage.py migrate
```

### 5. Run the development server

```bash
python manage.py runserver
```

The API is available at `http://localhost:8000/api/v1/`.

---

## Environment variables

The development settings module (`khaata.settings.development`) reads the following
variables from the environment or from a `.env` file in the `backend/` directory.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | **Yes** | — | Django secret key. Use a long random string. |
| `DJANGO_DEBUG` | No | `true` | Set to `false` in production. |
| `DJANGO_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Comma-separated hostnames. |
| `TIME_ZONE` | No | `Asia/Kolkata` | IANA timezone for the application. |
| `DB_HOST` | See note | — | PostgreSQL host. |
| `DB_PORT` | See note | — | PostgreSQL port (typically `5432`). |
| `DB_NAME` | See note | — | PostgreSQL database name. |
| `DB_USER` | See note | — | PostgreSQL username. |
| `DB_PASSWORD` | See note | — | PostgreSQL password. |
| `SESSION_COOKIE_SECURE` | No | `false` | Set to `true` in production (HTTPS). |
| `CSRF_COOKIE_SECURE` | No | `false` | Set to `true` in production (HTTPS). |
| `CSRF_TRUSTED_ORIGINS` | No | `http://localhost:5173` | Comma-separated trusted origins for CSRF. |

### Database behaviour

| Scenario | Result |
|---|---|
| **None** of `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD` are set | SQLite fallback used (`backend/db.sqlite3`). Suitable for quick local development only. |
| **All five** are set | PostgreSQL is used. |
| **Some but not all** are set | Startup is blocked with an explicit error. A partial configuration is never silently ignored. |

### Quick SQLite start (no PostgreSQL needed)

Leave all `DB_*` variables unset in `.env`. The application will create
`backend/db.sqlite3` automatically when you run `migrate`.

---

## Running tests

```bash
# All tests (uses SQLite in-memory; no PostgreSQL required)
pytest

# Specific test file
pytest khaata/apps/accounts/tests.py -v

# Settings logic tests
pytest tests/test_settings.py -v
```

Tests are configured in [`pytest.ini`](pytest.ini) to use `khaata.settings.test`,
which uses an in-memory SQLite database. No external service is required.

---

## Project structure

```text
backend/
├── manage.py                    # Django management entry point
├── requirements.txt             # Pinned production dependencies
├── requirements-dev.txt         # Additional test/dev dependencies
├── pytest.ini                   # pytest configuration
├── khaata/
│   ├── __init__.py
│   ├── urls.py                  # Root URL conf (admin + /api/v1/)
│   ├── api_urls.py              # /api/v1/ routes
│   ├── wsgi.py
│   └── settings/
│       ├── base.py              # Shared settings (no secrets, no env reads)
│       ├── development.py       # Dev settings with env-driven config
│       └── test.py              # Test settings (in-memory SQLite)
└── khaata/apps/
    ├── accounts/                # Custom User model + auth infrastructure
    │   ├── models.py            # User (UUID PK, email login, display_name, timezone)
    │   ├── admin.py
    │   ├── apps.py
    │   ├── tests.py
    │   └── migrations/
│       └── 0001_initial.py
    └── health/                  # Health check endpoint
        ├── views.py             # GET /api/v1/health/ → {"status": "ok"}
        ├── apps.py
        └── tests.py
```

---

## Migrations

```bash
# Check for unapplied or missing migrations without applying them
python manage.py makemigrations --check --dry-run

# Apply all migrations
python manage.py migrate

# Create migrations after model changes
python manage.py makemigrations
```

> **Important:** `AUTH_USER_MODEL = "accounts.User"` was declared in `settings/base.py`
> before the first migration was created. Do not change this setting after migrations exist.

---

## Django system check

```bash
python manage.py check --settings=khaata.settings.development
```

---

## Creating a superuser

```bash
python manage.py createsuperuser
```

The prompt will ask for email and password (username is set to the email internally).
