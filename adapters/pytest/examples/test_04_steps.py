import pytest

import reporting_labs as rl

# rl.step() groups the work of a test into named, timed steps. Steps nest.
# A failing step is marked red and the error is raised again as usual.
# Titles that start with Given / When / Then are styled as Gherkin.


@pytest.mark.meta(priority="P1", severity="major", owner="ravi", feature="orders")
def test_user_lifecycle_in_steps(api, base_url):
    with rl.step("Create a user"):
        uid = api.post(f"{base_url}/users", json={"name": "Kiran", "email": "kiran@example.com", "status": "active"}).json()["id"]
    with rl.step("Check the user"):
        with rl.step("Read it back"):
            user = api.get(f"{base_url}/users/{uid}").json()
        with rl.step("Compare fields"):
            assert user["email"] == "kiran@example.com"
    with rl.step("Clean up"):
        assert api.delete(f"{base_url}/users/{uid}").status_code == 204


@pytest.mark.meta(priority="P2", severity="major", owner="ravi", feature="reports")
def test_failing_step(api, base_url):
    with rl.step("Given the report service is up"):
        r = api.get(f"{base_url}/orders/slow-report")
    with rl.step("Then the daily report is ready"):
        assert r.status_code == 200, "the daily report should be ready"
