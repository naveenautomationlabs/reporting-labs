import pytest
import requests

# Every outcome the report knows. Some of these fail on purpose.

try:
    import pytest_rerunfailures  # noqa: F401
    HAS_RERUNS = True
except ImportError:
    HAS_RERUNS = False

ATTEMPTS = {"flaky": 0}


def test_passes(base_url):
    assert requests.get(f"{base_url}/health").ok


@pytest.mark.meta(priority="P0", severity="critical", owner="asha", feature="users")
def test_fails_on_a_missing_field(base_url):
    user = requests.get(f"{base_url}/users/1").json()
    assert user["phone"].startswith("+91")  # KeyError: the response has no phone


@pytest.mark.skip(reason="Payments sandbox is down until Friday")
def test_skipped():
    pass


@pytest.mark.xfail(reason="BUG-118: deleting twice returns 404, should be 204")
def test_known_bug(api, base_url):
    assert api.delete(f"{base_url}/users/999").status_code == 204


@pytest.mark.skipif(not HAS_RERUNS, reason="pip install pytest-rerunfailures to see a flaky test")
@pytest.mark.flaky(reruns=2)
def test_flaky(base_url):
    # Fails the first time, passes on the rerun: the report marks it flaky and shows both attempts.
    ATTEMPTS["flaky"] += 1
    assert ATTEMPTS["flaky"] > 1, "first attempt fails"


@pytest.fixture
def payments_client():
    raise ConnectionError("payments service did not start")


def test_setup_error(payments_client):
    # An error in a fixture belongs to the test that needed it.
    pass


def test_api_down():
    # Nothing listens on port 9: the report says the connection was refused, not "assert failed".
    requests.get("http://127.0.0.1:9/health", timeout=2)
