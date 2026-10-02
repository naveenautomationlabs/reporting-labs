import pytest
import requests

from shop_api import start


@pytest.fixture(scope="session")
def base_url():
    """The local shop API. Point this at your real API instead."""
    server, url = start()
    yield url
    server.shutdown()


@pytest.fixture
def api():
    """A requests session that sends the token. The report shows the header as ****."""
    with requests.Session() as s:
        s.headers["Authorization"] = "Bearer demo-token-12345"
        yield s
