"""
Tests for GET /api/v1/health/

Verifies:
- HTTP 200 response with JSON body {"status": "ok"}.
- Endpoint is accessible without authentication.
- Response does not leak credentials or environment details.
"""
import pytest
from django.urls import reverse, resolve


@pytest.mark.django_db
def test_health_returns_200(client):
    """Health endpoint returns HTTP 200."""
    url = reverse("health")
    response = client.get(url)
    assert response.status_code == 200


@pytest.mark.django_db
def test_health_returns_json_ok(client):
    """Health endpoint returns {"status": "ok"}."""
    url = reverse("health")
    response = client.get(url)
    data = response.json()
    assert data == {"status": "ok"}


@pytest.mark.django_db
def test_health_does_not_require_authentication(client):
    """
    Health endpoint must be reachable without authentication so that
    infrastructure monitoring tools (which carry no session cookie) work.
    """
    url = reverse("health")
    response = client.get(url)
    # A 401/403 would mean unauthenticated monitoring probes fail.
    assert response.status_code == 200


def test_health_url_resolves():
    """URL /api/v1/health/ resolves to the health view."""
    # This test does not touch the database.
    match = resolve("/api/v1/health/")
    assert match.url_name == "health"


@pytest.mark.django_db
def test_health_does_not_expose_secrets(client):
    """
    Response body must not contain keys that could indicate credential or
    environment leakage (stack trace keys, SECRET_KEY, password, etc.).
    """
    url = reverse("health")
    response = client.get(url)
    body = response.content.decode()
    sensitive_terms = [
        "SECRET_KEY",
        "PASSWORD",
        "traceback",
        "exception",
        "Traceback",
    ]
    for term in sensitive_terms:
        assert term not in body, f"Response body must not contain '{term}'"
