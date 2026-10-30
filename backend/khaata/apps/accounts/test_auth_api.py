"""
Comprehensive API tests for authentication endpoints:
- GET /api/v1/auth/csrf/
- POST /api/v1/auth/register/
- POST /api/v1/auth/login/
- POST /api/v1/auth/logout/
- GET /api/v1/auth/me/
- PATCH /api/v1/auth/me/
- CSRF enforcement and session cookie validation
- Security and error response format compliance
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

User = get_user_model()


# ---------------------------------------------------------------------------
# 1. CSRF Bootstrap Endpoint Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_csrf_endpoint_returns_200_and_sets_cookie(client):
    """GET /api/v1/auth/csrf/ returns 200 and sets csrftoken cookie."""
    url = reverse("auth-csrf")
    response = client.get(url)
    assert response.status_code == 200
    assert response.json() == {"detail": "CSRF cookie set."}
    assert "csrftoken" in response.cookies


@pytest.mark.django_db
def test_csrf_endpoint_accessible_unauthenticated(client):
    """CSRF bootstrap endpoint requires no authentication."""
    url = reverse("auth-csrf")
    response = client.get(url)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# 2. Registration Endpoint Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_register_success(client):
    """POST /api/v1/auth/register/ creates user and returns 201 with public fields."""
    url = reverse("auth-register")
    payload = {
        "email": "newuser@example.com",
        "password": "StrongPassword123!",
        "display_name": "New User",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 201

    data = response.json()
    assert "id" in data
    # Verify id is a valid UUID string
    uuid.UUID(data["id"])
    assert data["email"] == "newuser@example.com"
    assert data["display_name"] == "New User"
    assert data["timezone"] == "Asia/Kolkata"

    # Verify no sensitive data returned
    assert "password" not in data
    assert "password_hash" not in data

    # Verify user exists in database and password is encrypted
    user = User.objects.get(email="newuser@example.com")
    assert user.check_password("StrongPassword123!") is True
    assert user.password != "StrongPassword123!"


@pytest.mark.django_db
def test_register_without_display_name_defaults_to_blank(client):
    """POST /api/v1/auth/register/ without display_name succeeds with empty display_name."""
    url = reverse("auth-register")
    payload = {
        "email": "nodisplay@example.com",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 201
    assert response.json()["display_name"] == ""


@pytest.mark.django_db
def test_register_does_not_automatically_authenticate(client):
    """
    Per API contract, registration does not create an active session.
    A subsequent request to /auth/me/ without login must return 401.
    """
    url = reverse("auth-register")
    payload = {
        "email": "unauthenticated@example.com",
        "password": "StrongPassword123!",
    }
    reg_response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert reg_response.status_code == 201

    me_url = reverse("auth-me")
    me_response = client.get(me_url)
    assert me_response.status_code == 401


@pytest.mark.django_db
def test_register_duplicate_email_fails(client):
    """Registering with an already existing email returns 400 validation_error."""
    User.objects.create_user(email="existing@example.com", password="StrongPassword123!")

    url = reverse("auth-register")
    payload = {
        "email": "existing@example.com",
        "password": "AnotherPassword456!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400

    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "validation_error"
    assert "email" in data["error"]["details"]


@pytest.mark.django_db
def test_register_case_insensitive_duplicate_email_fails(client):
    """Registering with same email in different case returns 400 validation_error."""
    User.objects.create_user(email="caseuser@example.com", password="StrongPassword123!")

    url = reverse("auth-register")
    payload = {
        "email": "CASEUSER@EXAMPLE.COM",
        "password": "AnotherPassword456!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400

    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "email" in data["error"]["details"]


@pytest.mark.django_db
def test_register_invalid_email_format_fails(client):
    """Registering with invalid email format returns 400 validation_error."""
    url = reverse("auth-register")
    payload = {
        "email": "not-an-email",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "email" in response.json()["error"]["details"]


@pytest.mark.django_db
def test_register_short_password_fails(client):
    """Password under 10 characters returns 400 validation_error."""
    url = reverse("auth-register")
    payload = {
        "email": "shortpass@example.com",
        "password": "Short1!",  # 7 chars < 10
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "password" in data["error"]["details"]


@pytest.mark.django_db
def test_register_missing_fields_fails(client):
    """Missing required fields return 400 validation_error."""
    url = reverse("auth-register")
    response = client.post(url, data=json.dumps({}), content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "email" in data["error"]["details"]
    assert "password" in data["error"]["details"]


# ---------------------------------------------------------------------------
# 3. Login Endpoint Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_login_success(client):
    """POST /api/v1/auth/login/ with valid credentials creates session."""
    User.objects.create_user(
        email="loginuser@example.com",
        password="StrongPassword123!",
        display_name="Login User",
    )

    url = reverse("auth-login")
    payload = {
        "email": "loginuser@example.com",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200
    assert response.json() == {"detail": "Login successful."}
    assert "sessionid" in response.cookies

    # Authenticated session can now access /auth/me/
    me_url = reverse("auth-me")
    me_response = client.get(me_url)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "loginuser@example.com"
    assert me_response.json()["display_name"] == "Login User"


@pytest.mark.django_db
def test_login_case_insensitive_email(client):
    """Login succeeds when email case differs from registration."""
    User.objects.create_user(
        email="mixedcase@example.com",
        password="StrongPassword123!",
    )

    url = reverse("auth-login")
    payload = {
        "email": "MixedCase@Example.COM",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200
    assert response.json() == {"detail": "Login successful."}


@pytest.mark.django_db
def test_login_wrong_password_returns_401(client):
    """Login with incorrect password returns 401 without disclosing existence."""
    User.objects.create_user(
        email="user@example.com",
        password="StrongPassword123!",
    )

    url = reverse("auth-login")
    payload = {
        "email": "user@example.com",
        "password": "WrongPassword999!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "authentication_failed"
    assert data["error"]["message"] == "Invalid email or password."


@pytest.mark.django_db
def test_login_nonexistent_user_returns_401(client):
    """Login with nonexistent email returns same 401 response as wrong password."""
    url = reverse("auth-login")
    payload = {
        "email": "nobody@example.com",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "authentication_failed"
    assert data["error"]["message"] == "Invalid email or password."


@pytest.mark.django_db
def test_login_inactive_user_returns_401(client):
    """Inactive user cannot log in."""
    user = User.objects.create_user(
        email="inactive@example.com",
        password="StrongPassword123!",
    )
    user.is_active = False
    user.save()

    url = reverse("auth-login")
    payload = {
        "email": "inactive@example.com",
        "password": "StrongPassword123!",
    }
    response = client.post(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_failed"


@pytest.mark.django_db
def test_login_missing_fields_returns_400(client):
    """Login with missing fields returns 400 validation_error."""
    url = reverse("auth-login")
    response = client.post(url, data=json.dumps({}), content_type="application/json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


# ---------------------------------------------------------------------------
# 4. Logout Endpoint Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_logout_success(client):
    """POST /api/v1/auth/logout/ terminates session and returns 204."""
    user = User.objects.create_user(
        email="logoutuser@example.com",
        password="StrongPassword123!",
    )
    client.force_login(user)

    # Verify logged in
    me_url = reverse("auth-me")
    assert client.get(me_url).status_code == 200

    # Logout
    logout_url = reverse("auth-logout")
    logout_response = client.post(logout_url)
    assert logout_response.status_code == 204
    assert logout_response.content == b""

    # Subsequent access is unauthorized
    assert client.get(me_url).status_code == 401


@pytest.mark.django_db
def test_logout_unauthenticated_returns_401(client):
    """POST /api/v1/auth/logout/ when unauthenticated returns 401."""
    logout_url = reverse("auth-logout")
    response = client.post(logout_url)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


# ---------------------------------------------------------------------------
# 5. Current User (Me) Endpoint Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_me_authenticated_returns_profile(client):
    """GET /api/v1/auth/me/ returns authenticated user's profile."""
    user = User.objects.create_user(
        email="meuser@example.com",
        password="StrongPassword123!",
        display_name="Me User",
    )
    client.force_login(user)

    url = reverse("auth-me")
    response = client.get(url)
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == str(user.id)
    assert data["email"] == "meuser@example.com"
    assert data["display_name"] == "Me User"
    assert data["timezone"] == "Asia/Kolkata"
    assert "password" not in data


@pytest.mark.django_db
def test_me_unauthenticated_returns_401(client):
    """GET /api/v1/auth/me/ without session returns 401."""
    url = reverse("auth-me")
    response = client.get(url)
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
def test_user_isolation_between_sessions(client):
    """Different authenticated sessions see only their own user data."""
    user_a = User.objects.create_user(email="usera@example.com", password="Password123!", display_name="User A")
    user_b = User.objects.create_user(email="userb@example.com", password="Password123!", display_name="User B")

    client_a = Client()
    client_a.force_login(user_a)

    client_b = Client()
    client_b.force_login(user_b)

    url = reverse("auth-me")
    resp_a = client_a.get(url)
    resp_b = client_b.get(url)

    assert resp_a.json()["id"] == str(user_a.id)
    assert resp_a.json()["email"] == "usera@example.com"
    assert resp_b.json()["id"] == str(user_b.id)
    assert resp_b.json()["email"] == "userb@example.com"


# ---------------------------------------------------------------------------
# 6. Update Profile (PATCH /auth/me/) Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_patch_me_display_name_and_timezone(client):
    """PATCH /api/v1/auth/me/ updates display_name and timezone."""
    user = User.objects.create_user(
        email="patchuser@example.com",
        password="StrongPassword123!",
        display_name="Old Name",
    )
    client.force_login(user)

    url = reverse("auth-me")
    payload = {
        "display_name": "Updated Name",
        "timezone": "America/New_York",
    }
    response = client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200

    data = response.json()
    assert data["display_name"] == "Updated Name"
    assert data["timezone"] == "America/New_York"

    user.refresh_from_db()
    assert user.display_name == "Updated Name"
    assert user.timezone == "America/New_York"


@pytest.mark.django_db
def test_patch_me_invalid_timezone_fails(client):
    """PATCH /api/v1/auth/me/ with invalid timezone returns 400 validation_error."""
    user = User.objects.create_user(
        email="tzuser@example.com",
        password="StrongPassword123!",
    )
    client.force_login(user)

    url = reverse("auth-me")
    payload = {
        "timezone": "Invalid/Fake_Zone",
    }
    response = client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400

    data = response.json()
    assert data["error"]["code"] == "validation_error"
    assert "timezone" in data["error"]["details"]


@pytest.mark.django_db
def test_patch_me_read_only_fields_ignored(client):
    """PATCH /api/v1/auth/me/ cannot modify id or email."""
    user = User.objects.create_user(
        email="readonly@example.com",
        password="StrongPassword123!",
    )
    original_id = user.id
    client.force_login(user)

    url = reverse("auth-me")
    fake_uuid = str(uuid.uuid4())
    payload = {
        "id": fake_uuid,
        "email": "hacked@example.com",
        "display_name": "Legit Name",
    }
    response = client.patch(url, data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200

    user.refresh_from_db()
    assert user.id == original_id
    assert user.email == "readonly@example.com"
    assert user.display_name == "Legit Name"


@pytest.mark.django_db
def test_patch_me_unauthenticated_returns_401(client):
    """PATCH /api/v1/auth/me/ without session returns 401."""
    url = reverse("auth-me")
    response = client.patch(url, data=json.dumps({"display_name": "Test"}), content_type="application/json")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# 7. CSRF Protection and Session Security Tests
# ---------------------------------------------------------------------------

def _post_json(client, url, payload, **extra):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **extra)


@pytest.mark.django_db
def test_login_without_csrf_token_is_rejected():
    """Anonymous login with CSRF enforcement and no token -> 403, no session."""
    csrf_client = Client(enforce_csrf_checks=True)
    User.objects.create_user(email="lcsrf@example.com", password="StrongPassword123!")

    resp = _post_json(
        csrf_client,
        reverse("auth-login"),
        {"email": "lcsrf@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permission_denied"
    assert "sessionid" not in resp.cookies
    assert csrf_client.get(reverse("auth-me")).status_code == 401


@pytest.mark.django_db
def test_login_with_cookie_but_no_header_is_rejected():
    """CSRF cookie present but X-CSRFToken header missing -> 403."""
    csrf_client = Client(enforce_csrf_checks=True)
    User.objects.create_user(email="lcsrf2@example.com", password="StrongPassword123!")
    csrf_client.get(reverse("auth-csrf"))

    resp = _post_json(
        csrf_client,
        reverse("auth-login"),
        {"email": "lcsrf2@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_login_with_invalid_csrf_token_is_rejected():
    csrf_client = Client(enforce_csrf_checks=True)
    User.objects.create_user(email="lcsrf3@example.com", password="StrongPassword123!")
    csrf_client.get(reverse("auth-csrf"))

    resp = _post_json(
        csrf_client,
        reverse("auth-login"),
        {"email": "lcsrf3@example.com", "password": "StrongPassword123!"},
        HTTP_X_CSRFTOKEN="x" * 64,
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_login_with_valid_csrf_token_succeeds():
    """Real browser flow: bootstrap CSRF cookie, then login with X-CSRFToken."""
    csrf_client = Client(enforce_csrf_checks=True)
    User.objects.create_user(email="lcsrf4@example.com", password="StrongPassword123!")
    token = csrf_client.get(reverse("auth-csrf")).cookies["csrftoken"].value

    resp = _post_json(
        csrf_client,
        reverse("auth-login"),
        {"email": "lcsrf4@example.com", "password": "StrongPassword123!"},
        HTTP_X_CSRFTOKEN=token,
    )
    assert resp.status_code == 200
    assert "sessionid" in resp.cookies
    assert csrf_client.get(reverse("auth-me")).status_code == 200


@pytest.mark.django_db
def test_register_requires_csrf_token():
    """Registration is an anonymous state-changing request: CSRF is enforced."""
    csrf_client = Client(enforce_csrf_checks=True)
    payload = {"email": "rcsrf@example.com", "password": "StrongPassword123!"}

    resp = _post_json(csrf_client, reverse("auth-register"), payload)
    assert resp.status_code == 403
    assert not User.objects.filter(email="rcsrf@example.com").exists()

    token = csrf_client.get(reverse("auth-csrf")).cookies["csrftoken"].value
    resp = _post_json(csrf_client, reverse("auth-register"), payload, HTTP_X_CSRFTOKEN=token)
    assert resp.status_code == 201
    assert User.objects.filter(email="rcsrf@example.com").exists()


@pytest.mark.django_db
def test_logout_requires_csrf_token():
    csrf_client = Client(enforce_csrf_checks=True)
    user = User.objects.create_user(email="locsrf@example.com", password="StrongPassword123!")
    csrf_client.force_login(user)
    token = csrf_client.get(reverse("auth-csrf")).cookies["csrftoken"].value

    assert csrf_client.post(reverse("auth-logout")).status_code == 403
    assert csrf_client.get(reverse("auth-me")).status_code == 200  # still logged in
    assert csrf_client.post(reverse("auth-logout"), HTTP_X_CSRFTOKEN=token).status_code == 204


@pytest.mark.django_db
def test_csrf_protection_enforced_on_authenticated_state_changing_requests():
    """
    With enforce_csrf_checks=True:
    1. Authenticated state-changing request without CSRF token returns 403 Forbidden.
    2. Authenticated state-changing request with valid CSRF token succeeds.
    """
    csrf_client = Client(enforce_csrf_checks=True)
    User.objects.create_user(
        email="csrfuser@example.com",
        password="StrongPassword123!",
    )

    # Obtain CSRF token via bootstrap endpoint, then login with it
    csrf_url = reverse("auth-csrf")
    csrf_resp = csrf_client.get(csrf_url)
    assert csrf_resp.status_code == 200
    csrf_token = csrf_resp.cookies["csrftoken"].value

    login_resp = _post_json(
        csrf_client,
        reverse("auth-login"),
        {"email": "csrfuser@example.com", "password": "StrongPassword123!"},
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    assert login_resp.status_code == 200
    # Django rotates the CSRF token on login; use the fresh cookie value.
    csrf_token = login_resp.cookies["csrftoken"].value

    # Attempt state-changing request WITHOUT CSRF header -> must fail with 403
    patch_url = reverse("auth-me")
    fail_resp = csrf_client.patch(
        patch_url,
        data=json.dumps({"display_name": "No CSRF"}),
        content_type="application/json",
    )
    assert fail_resp.status_code == 403

    # Attempt state-changing request WITH valid CSRF header -> must succeed with 200
    success_resp = csrf_client.patch(
        patch_url,
        data=json.dumps({"display_name": "With CSRF"}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    assert success_resp.status_code == 200
    assert success_resp.json()["display_name"] == "With CSRF"


# ---------------------------------------------------------------------------
# 8. Security & Absence of Secrets in Responses
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_no_secrets_in_any_auth_response(client):
    """
    Verify that across all auth endpoints, no secret keys, password hashes,
    or internal tracebacks appear in response bodies.
    """
    user = User.objects.create_user(
        email="audit@example.com",
        password="AuditPassword123!",
    )
    client.force_login(user)

    sensitive_tokens = ["SECRET_KEY", "pbkdf2", "argon2", "bcrypt", "Traceback", "exception"]

    endpoints = [
        ("GET", reverse("auth-csrf"), None),
        ("GET", reverse("auth-me"), None),
        ("PATCH", reverse("auth-me"), {"display_name": "Audit"}),
    ]

    for method, url, data in endpoints:
        if method == "GET":
            resp = client.get(url)
        else:
            resp = client.patch(url, data=json.dumps(data), content_type="application/json")
        body = resp.content.decode()
        for token in sensitive_tokens:
            assert token not in body, f"Endpoint {url} leaked '{token}' in response"


# ---------------------------------------------------------------------------
# 9. Session lifecycle (rotation / invalidation)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_session_key_rotates_on_login():
    """Login must cycle the session key (session-fixation protection)."""
    c = Client()
    User.objects.create_user(email="rot@example.com", password="StrongPassword123!")

    # Establish a pre-login anonymous session with a known key.
    session = c.session
    session["pre_login"] = "x"
    session.save()
    pre_key = c.session.session_key
    assert pre_key

    resp = _post_json(
        c, reverse("auth-login"), {"email": "rot@example.com", "password": "StrongPassword123!"}
    )
    assert resp.status_code == 200
    post_key = resp.cookies["sessionid"].value
    assert post_key != pre_key

    # The pre-login session key must not authenticate anyone.
    attacker = Client()
    attacker.cookies["sessionid"] = pre_key
    assert attacker.get(reverse("auth-me")).status_code == 401


@pytest.mark.django_db
def test_old_session_rejected_after_logout():
    """A captured session cookie must stop working once the user logs out."""
    user = User.objects.create_user(email="lo@example.com", password="StrongPassword123!")
    c = Client()
    resp = _post_json(
        c, reverse("auth-login"), {"email": "lo@example.com", "password": "StrongPassword123!"}
    )
    old_key = resp.cookies["sessionid"].value
    assert c.get(reverse("auth-me")).status_code == 200

    assert c.post(reverse("auth-logout")).status_code == 204

    replay = Client()
    replay.cookies["sessionid"] = old_key
    assert replay.get(reverse("auth-me")).status_code == 401
    assert user.id  # sanity


@pytest.mark.django_db
def test_login_response_does_not_expose_session_or_csrf_secrets():
    c = Client()
    User.objects.create_user(email="sec@example.com", password="StrongPassword123!")
    resp = _post_json(
        c, reverse("auth-login"), {"email": "sec@example.com", "password": "StrongPassword123!"}
    )
    body = resp.content.decode()
    assert resp.cookies["sessionid"].value not in body
    if "csrftoken" in resp.cookies:
        assert resp.cookies["csrftoken"].value not in body
    csrf_body = Client().get(reverse("auth-csrf"))
    assert csrf_body.cookies["csrftoken"].value not in csrf_body.content.decode()


# ---------------------------------------------------------------------------
# 10. Login failure uniformity and email normalisation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_login_failures_are_indistinguishable(client):
    """Wrong password, unknown email and inactive account yield identical responses."""
    User.objects.create_user(email="real@example.com", password="StrongPassword123!")
    inactive = User.objects.create_user(email="off@example.com", password="StrongPassword123!")
    inactive.is_active = False
    inactive.save()

    attempts = [
        {"email": "real@example.com", "password": "WrongPassword999!"},
        {"email": "ghost@example.com", "password": "StrongPassword123!"},
        {"email": "off@example.com", "password": "StrongPassword123!"},
        {"email": "off@example.com", "password": "WrongPassword999!"},
    ]
    responses = [_post_json(client, reverse("auth-login"), a) for a in attempts]
    assert {r.status_code for r in responses} == {401}
    assert len({r.content for r in responses}) == 1
    assert all("sessionid" not in r.cookies for r in responses)


@pytest.mark.django_db
def test_login_mixed_case_stored_and_submitted_email_creates_session(client):
    User.objects.create_user(email="Mixed.Case@Example.COM", password="StrongPassword123!")
    resp = _post_json(
        client,
        reverse("auth-login"),
        {"email": "MIXED.case@example.com", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 200
    assert client.get(reverse("auth-me")).json()["email"] == "mixed.case@example.com"


@pytest.mark.django_db
def test_register_mixed_case_stores_lowercase_and_blocks_duplicates(client):
    resp = _post_json(
        client,
        reverse("auth-register"),
        {"email": "Fresh.User@Example.COM", "password": "StrongPassword123!"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "fresh.user@example.com"
    dup = _post_json(
        client,
        reverse("auth-register"),
        {"email": "FRESH.USER@example.com", "password": "StrongPassword123!"},
    )
    assert dup.status_code == 400
    assert User.objects.filter(email__iexact="fresh.user@example.com").count() == 1


@pytest.mark.django_db
def test_passwords_use_configured_hasher():
    user = User.objects.create_user(email="hash@example.com", password="StrongPassword123!")
    assert user.password.startswith("pbkdf2_sha256$")


# ---------------------------------------------------------------------------
# 11. Profile update: protected fields
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_patch_me_cannot_modify_protected_fields(client):
    user = User.objects.create_user(email="prot@example.com", password="StrongPassword123!")
    old_hash = user.password
    client.force_login(user)

    resp = client.patch(
        reverse("auth-me"),
        data=json.dumps(
            {
                "password": "HackedPassword999!",
                "is_staff": True,
                "is_superuser": True,
                "is_active": False,
                "username": "admin",
                "created_at": "2000-01-01T00:00:00Z",
                "display_name": "Ok",
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert set(resp.json()) == {"id", "email", "display_name", "timezone"}
    user.refresh_from_db()
    assert user.password == old_hash
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.is_active is True
    assert user.username == "prot@example.com"
    assert user.created_at.year != 2000
    assert user.display_name == "Ok"


@pytest.mark.django_db
def test_patch_me_never_affects_other_users(client):
    me = User.objects.create_user(email="me@example.com", password="StrongPassword123!")
    other = User.objects.create_user(
        email="other@example.com", password="StrongPassword123!", display_name="Other"
    )
    client.force_login(me)
    client.patch(
        reverse("auth-me"),
        data=json.dumps({"id": str(other.id), "display_name": "Changed"}),
        content_type="application/json",
    )
    other.refresh_from_db()
    me.refresh_from_db()
    assert other.display_name == "Other"
    assert me.display_name == "Changed"


# ---------------------------------------------------------------------------
# 12. Error envelope / status consistency through the real HTTP stack
# ---------------------------------------------------------------------------

def _assert_envelope(resp, status, code):
    assert resp.status_code == status
    assert resp["Content-Type"].startswith("application/json")
    err = resp.json()["error"]
    assert set(err) == {"code", "message", "details"}
    assert err["code"] == code
    assert isinstance(err["message"], str)
    assert isinstance(err["details"], dict)


@pytest.mark.django_db
def test_http_error_envelopes_and_status_codes(client):
    _assert_envelope(client.get(reverse("auth-me")), 401, "not_authenticated")
    _assert_envelope(client.get(reverse("auth-login")), 405, "method_not_allowed")
    _assert_envelope(client.get("/api/v1/auth/does-not-exist/"), 404, "not_found")
    _assert_envelope(
        _post_json(client, reverse("auth-login"), {}), 400, "validation_error"
    )
    _assert_envelope(
        _post_json(client, reverse("auth-login"), {"email": "a@example.com", "password": "x"}),
        401,
        "authentication_failed",
    )
    csrf_client = Client(enforce_csrf_checks=True)
    _assert_envelope(
        _post_json(csrf_client, reverse("auth-login"), {"email": "a@example.com", "password": "x"}),
        403,
        "permission_denied",
    )


@pytest.mark.django_db
def test_validation_errors_do_not_echo_password(client):
    secret = "short"
    resp = _post_json(
        client, reverse("auth-register"), {"email": "p@example.com", "password": secret}
    )
    assert resp.status_code == 400
    assert secret not in resp.content.decode()


# ---------------------------------------------------------------------------
# 13. Cookie attributes
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_session_cookie_attributes():
    c = Client()
    User.objects.create_user(email="ck@example.com", password="StrongPassword123!")
    resp = _post_json(
        c, reverse("auth-login"), {"email": "ck@example.com", "password": "StrongPassword123!"}
    )
    cookie = resp.cookies["sessionid"]
    assert cookie["httponly"]
    assert cookie["samesite"] == "Lax"
    assert not cookie["secure"]  # test settings relax Secure for HTTP


@pytest.mark.django_db
def test_csrf_cookie_is_readable_by_spa_and_samesite_lax():
    cookie = Client().get(reverse("auth-csrf")).cookies["csrftoken"]
    assert not cookie["httponly"]  # SPA must read it to send X-CSRFToken
    assert cookie["samesite"] == "Lax"


@pytest.mark.django_db
def test_cookies_marked_secure_when_secure_settings_enabled(settings):
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    c = Client()
    User.objects.create_user(email="sk@example.com", password="StrongPassword123!")
    csrf = c.get(reverse("auth-csrf"), secure=True)
    assert csrf.cookies["csrftoken"]["secure"]
    resp = _post_json(
        c,
        reverse("auth-login"),
        {"email": "sk@example.com", "password": "StrongPassword123!"},
        secure=True,
        HTTP_X_CSRFTOKEN=csrf.cookies["csrftoken"].value,
    )
    assert resp.status_code == 200
    assert resp.cookies["sessionid"]["secure"]
    assert resp.cookies["sessionid"]["httponly"]
