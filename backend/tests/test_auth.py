"""Backend tests for JWT auth + protected/public routes (MapData Collector)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maps-scraper-lab.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
# Test credentials must be supplied via environment to avoid leaking them in VCS.
# Local development can populate /app/memory/test_credentials.md (read by the test runner).
EXISTING_EMAIL = os.environ.get("TEST_USER_EMAIL")
EXISTING_PASSWORD = os.environ.get("TEST_USER_PASSWORD")

if not EXISTING_EMAIL or not EXISTING_PASSWORD:
    pytest.skip(
        "TEST_USER_EMAIL / TEST_USER_PASSWORD env vars are required to run auth tests.",
        allow_module_level=True,
    )


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def access_token(session):
    r = session.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"]
    return data["access_token"]


# ---- /auth/login ----
class TestLogin:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d.get("success")
        assert isinstance(d.get("access_token"), str) and len(d["access_token"]) > 20
        assert d.get("token_type") == "bearer"
        assert d["user"]["email"] == EXISTING_EMAIL
        assert "id" in d["user"]

    def test_login_invalid_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_login_unknown_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "nope_does_not_exist@example.com", "password": "x"})
        assert r.status_code == 401


# ---- /auth/register ----
class TestRegister:
    def test_register_new_user_and_login(self, session):
        email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
        password = "TestPass#1234"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"]
        assert isinstance(d.get("access_token"), str)
        assert d["user"]["email"] == email.lower()
        # Verify login works for new user
        r2 = session.post(f"{API}/auth/login", json={"email": email, "password": password})
        assert r2.status_code == 200

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={"email": EXISTING_EMAIL, "password": "anything"})
        assert r.status_code == 400


# ---- /auth/me ----
class TestMe:
    def test_me_with_valid_token(self, session, access_token):
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert r.status_code == 200
        assert r.json()["email"] == EXISTING_EMAIL

    def test_me_without_token(self, session):
        # Use bare requests to avoid carrying session-wide Auth (none set anyway)
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.real.jwt"})
        assert r.status_code == 401


# ---- Protected endpoints require auth ----
class TestProtectedRoutes:
    PROTECTED_GET = ["/history", "/search-history"]

    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_protected_get_no_token(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} should be 401 without token, got {r.status_code}"

    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_protected_get_with_token(self, path, access_token):
        r = requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {access_token}"})
        assert r.status_code == 200, f"{path} should be 200 with token, got {r.status_code} {r.text}"

    def test_delete_history_all_no_token(self):
        r = requests.delete(f"{API}/history")
        assert r.status_code == 401

    def test_put_config_category_no_token(self):
        r = requests.put(f"{API}/config/category", json={"category_id": "foodie", "place_types": ["restaurant"]})
        assert r.status_code == 401

    def test_put_config_category_with_token(self, access_token):
        r = requests.put(
            f"{API}/config/category",
            json={"category_id": "foodie", "keywords": "test keyword"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert r.status_code == 200

    def test_post_config_reset_no_token(self):
        r = requests.post(f"{API}/config/reset")
        assert r.status_code == 401

    def test_post_config_reset_with_token(self, access_token):
        r = requests.post(f"{API}/config/reset", headers={"Authorization": f"Bearer {access_token}"})
        assert r.status_code == 200


# ---- Public endpoints accessible without auth ----
class TestPublicRoutes:
    def test_get_config_public(self):
        r = requests.get(f"{API}/config")
        assert r.status_code == 200
        assert "categories" in r.json()

    def test_get_categories_public(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200

    def test_get_regions_public(self):
        r = requests.get(f"{API}/regions")
        assert r.status_code == 200

    def test_get_shorten_status_public(self):
        r = requests.get(f"{API}/shorten-status")
        assert r.status_code == 200

    def test_post_places_search_public_validation(self):
        # 400 (validation) is fine — means auth is NOT blocking the request
        r = requests.post(f"{API}/places/search", json={"category": "foodie"})
        assert r.status_code != 401, f"places/search should be public, got 401"

    def test_post_shorten_links_public(self):
        r = requests.post(f"{API}/shorten-links", json={"urls": []})
        # Either 200 or 500 (config missing), but must NOT be 401
        assert r.status_code != 401

    def test_post_generate_descriptions_public(self):
        r = requests.post(f"{API}/generate-descriptions", json={"places": []})
        assert r.status_code != 401
