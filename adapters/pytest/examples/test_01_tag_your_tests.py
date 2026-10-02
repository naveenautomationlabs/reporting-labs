import pytest
import requests

import reporting_labs as rl

# @pytest.mark.meta tells the report who owns a test and how much it matters.
# priority, severity, owner and feature get charts and filters. story and issue become links
# (see "links" in reporting-labs.config.json). Any other key is kept and shows on the test.
# A meta marker on a class applies to every test in it; a marker on a test wins.
# Other markers (smoke, regression...) show as tags.


@pytest.mark.smoke
@pytest.mark.meta(feature="users", owner="asha", epic="SHOP-100")
class TestUserProfile:
    @pytest.mark.meta(priority="P0", severity="blocker", story="SHOP-101")
    def test_reads_a_user(self, base_url):
        r = requests.get(f"{base_url}/users/1")
        assert r.status_code == 200
        assert r.json()["name"] == "Asha Rao"

    @pytest.mark.meta(priority="P2", severity="minor", story="SHOP-102", reviewed_by="ravi")
    def test_health_check(self, base_url):
        assert requests.get(f"{base_url}/health").json() == {"status": "ok"}


@pytest.mark.regression
def test_meta_set_while_running(base_url):
    # rl.meta() does the same from inside the test, for values you only know at run time.
    r = requests.get(f"{base_url}/users", params={"status": "active"})
    rl.meta(priority="P1", severity="major", owner="nina", feature="search", testCaseId=f"TC-{len(r.json())}")
    assert r.ok


def test_without_meta(base_url):
    # No meta at all: the report lists it after the run, so the team can fill the gaps.
    assert requests.get(f"{base_url}/health").ok
