"""
Cookie-security configuration and error-view tests.
"""
import importlib
import json

from django.test import Client, RequestFactory

from khaata.core import views as core_views


def test_base_settings_are_secure_by_default():
    """
    base.py is the parent of every environment. Cookies must be Secure there so
    a production settings module cannot inherit insecure values by omission.
    """
    base = importlib.import_module("khaata.settings.base")
    assert base.SESSION_COOKIE_SECURE is True
    assert base.CSRF_COOKIE_SECURE is True
    assert base.SESSION_COOKIE_HTTPONLY is True
    assert base.SESSION_COOKIE_SAMESITE == "Lax"
    assert base.CSRF_COOKIE_SAMESITE == "Lax"
    # SPA must read the CSRF cookie to send X-CSRFToken.
    assert base.CSRF_COOKIE_HTTPONLY is False


def test_development_settings_relax_secure_only_via_environment():
    """development.py reads Secure flags from env (default False for local HTTP)."""
    import pathlib

    src = (pathlib.Path(__file__).resolve().parent.parent / "khaata/settings/development.py").read_text()
    assert 'config("SESSION_COOKIE_SECURE", default=False' in src
    assert 'config("CSRF_COOKIE_SECURE", default=False' in src


def test_handler500_returns_generic_json_for_api_paths():
    resp = core_views.handler500(RequestFactory().get("/api/v1/anything/"))
    assert resp.status_code == 500
    assert resp["Content-Type"].startswith("application/json")
    body = json.loads(resp.content)
    assert body == {
        "error": {
            "code": "server_error",
            "message": "An unexpected error occurred.",
            "details": {},
        }
    }


def test_unexpected_exception_returns_generic_500_without_leaking(monkeypatch):
    """An unhandled exception inside a view must not leak its message or traceback."""
    from khaata.apps.accounts import views

    def boom(self, request, *args, **kwargs):
        raise RuntimeError("SECRET-INTERNAL-DETAIL /srv/app/db password=hunter2")

    monkeypatch.setattr(views.CsrfView, "get", boom)
    resp = Client(raise_request_exception=False).get("/api/v1/auth/csrf/")
    assert resp.status_code == 500
    assert resp["Content-Type"].startswith("application/json")
    text = resp.content.decode()
    assert json.loads(text)["error"]["code"] == "server_error"
    for leak in ("SECRET-INTERNAL-DETAIL", "hunter2", "Traceback", "RuntimeError", "/srv/app"):
        assert leak not in text


def test_handler404_returns_json_for_api_paths():
    resp = core_views.handler404(RequestFactory().get("/api/v1/nope/"))
    assert resp.status_code == 404
    assert resp["Content-Type"].startswith("application/json")
