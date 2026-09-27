import pytest
import requests

import reporting_labs as rl

# Nothing special in these tests: plain requests calls. `rl_capture_api = true` in pytest.ini
# (or --rl-capture-api) records every one of them: method, URL, status, timing, headers and
# both bodies, in the test and in the API tab. The Bearer token is masked.
# httpx is recorded the same way. For any other client, call rl.api(...) yourself.


@pytest.mark.meta(priority="P0", severity="blocker", owner="asha", feature="users-api", story="API-301")
class TestUsersApi:
    def test_create_read_update_delete(self, api, base_url):
        r = api.post(f"{base_url}/users", json={"name": "Aarav Sharma", "email": "aarav@example.com", "status": "active"})
        assert r.status_code == 201
        uid = r.json()["id"]

        assert api.get(f"{base_url}/users/{uid}").json()["name"] == "Aarav Sharma"
        assert api.patch(f"{base_url}/users/{uid}", json={"status": "inactive"}).json()["status"] == "inactive"
        assert api.delete(f"{base_url}/users/{uid}").status_code == 204

    def test_list_with_filters(self, base_url):
        # params become the query string, and show in the URL in the report
        r = requests.get(f"{base_url}/users", params={"status": "active", "per_page": 5})
        assert r.ok and len(r.json()) > 0

    def test_blocked_token_is_refused(self, base_url):
        r = requests.post(f"{base_url}/users", json={"name": "x"}, headers={"Authorization": "Bearer blocked-token"})
        assert r.status_code == 403


@pytest.mark.meta(priority="P1", severity="critical", owner="nina", feature="users-api", issue="42")
def test_validation_message(api, base_url):
    # Fails on purpose: the API answers 422 with the reason. The report explains the status
    # mismatch and the API tab shows the body that says which fields are missing.
    r = api.post(f"{base_url}/users", json={"name": "No Email"})
    assert r.status_code == 201


def test_other_client_recorded_by_hand():
    # A client that is not requests or httpx: record the call yourself.
    rl.api(method="GET", url="grpc://inventory/Stock/Get", status=200, duration=12,
           request_body={"sku": "A1"}, response_body={"sku": "A1", "stock": 3}, name="Inventory stock (gRPC)")
