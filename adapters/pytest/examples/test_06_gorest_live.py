import os
import time

import pytest
import requests

import reporting_labs as rl

# The same kind of tests against the public https://gorest.in API, like the Playwright examples.
# Skipped unless RL_LIVE=1, so the examples also work offline and in CI.
# gorest.in: GET is open. POST / PATCH / DELETE need `Authorization: Bearer <any string>`.
# The token `blocked-token` always returns 403.

pytestmark = pytest.mark.skipif(not os.environ.get("RL_LIVE"), reason="set RL_LIVE=1 to call gorest.in")

BASE = "https://gorest.in/public/v2"
AUTH = {"Authorization": "Bearer demo-token"}


@pytest.mark.meta(priority="P1", severity="major", owner="naveen", feature="users-api", story="API-301")
def test_create_and_read_a_user():
    email = f"aarav.{int(time.time() * 1000)}@example.com"
    rl.test_data({"email": email}, "New user")
    r = requests.post(f"{BASE}/users", headers=AUTH, json={"name": "Aarav Sharma", "email": email, "gender": "male", "status": "active"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert requests.get(f"{BASE}/users/{uid}").json()["id"] == uid


@pytest.mark.meta(priority="P2", severity="minor", owner="priya", feature="users-api")
def test_list_users():
    r = requests.get(f"{BASE}/users", params={"status": "active", "per_page": 5})
    assert r.ok and len(r.json()) > 0


@pytest.mark.meta(priority="P2", severity="minor", owner="priya", feature="users-api")
def test_blocked_token():
    r = requests.post(f"{BASE}/users", headers={"Authorization": "Bearer blocked-token"}, json={})
    assert r.status_code == 403
