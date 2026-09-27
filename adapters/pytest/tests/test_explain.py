import re
from pathlib import Path

import pytest

from reporting_labs.explain import LABELS, explain_error

TEMPLATE = Path(__file__).resolve().parents[3] / "src" / "template.ts"
EXPLAIN_TS = Path(__file__).resolve().parents[3] / "src" / "explain.ts"


def kind(msg):
    return explain_error(msg)["kind"]


def test_empty():
    assert explain_error("") is None
    assert explain_error("\x1b[31m \x1b[0m") is None


def test_labels_match_explain_ts():
    ts = EXPLAIN_TS.read_text()
    block = ts[ts.index("const LABELS"):ts.index("};", ts.index("const LABELS"))]
    pairs = dict(re.findall(r"'([a-z-]+)': '([^']+)'", block))
    assert pairs == LABELS


def test_every_kind_is_styled_or_used_by_the_template():
    # The template renders any label as text and uses kind as a CSS class. Make sure the kinds we
    # emit from the new rules are ones the template already knows.
    tpl = TEMPLATE.read_text()
    for k in ["assertion", "api", "script", "file", "thrown"]:
        assert re.search(rf"\b{k}\b", tpl), k


# ── status code ──────────────────────────────────────────────────────────────

def test_status_mismatch_4xx():
    x = explain_error("assert 404 == 200\n +  where 404 = <Response [404]>.status_code")
    assert x["kind"] == "api" and x["label"] == "API call failed"
    assert x["summary"] == "The API returned status 404, the test expected 200."
    assert "path" in x["hint"] and x["matcher"] == "status_code"


def test_status_mismatch_5xx_httpx_style():
    x = explain_error("assert 503 == 200\n +  where 503 = <Response [503 Service Unavailable]>.status_code")
    assert x["summary"] == "The API returned status 503, the test expected 200."
    assert "server failed" in x["hint"]


def test_status_mismatch_bare_numbers():
    assert kind("assert 201 == 200") == "api"
    assert kind("assert 401 in (200, 204)\n +  where 401 = <Response [401]>.status_code") == "api"


def test_status_mismatch_after_a_custom_message():
    x = explain_error("AssertionError: the daily report should be ready\nassert 503 == 200\n +  where 503 = <Response [503]>.status_code")
    assert x["kind"] == "api" and x["summary"] == "The API returned status 503, the test expected 200."


def test_status_mismatch_with_assertion_error_prefix():
    # pytest keeps the prefix in some reports, for example an xfail test
    x = explain_error("AssertionError: assert 404 == 204\n +  where 404 = <Response [404]>.status_code")
    assert x["summary"] == "The API returned status 404, the test expected 204."


def test_plain_number_compare_is_not_status():
    assert explain_error("assert 3 == 4")["kind"] == "assertion"
    assert explain_error("assert 1000 == 200")["kind"] == "assertion"


def test_response_ok_false():
    x = explain_error("assert False\n +  where False = <Response [500]>.ok")
    assert x["kind"] == "api" and "status 500" in x["summary"]


def test_raise_for_status_requests():
    x = explain_error("requests.exceptions.HTTPError: 404 Client Error: Not Found for url: http://127.0.0.1:5000/users/9")
    assert x["kind"] == "api" and x["summary"] == "The API answered 404 Not Found."
    assert x["url"] == "http://127.0.0.1:5000/users/9"


def test_raise_for_status_httpx():
    x = explain_error("httpx.HTTPStatusError: Server error '500 Internal Server Error' for url 'http://x/api'\nFor more information check: https://...")
    assert x["summary"] == "The API answered 500 Internal Server Error." and x["url"] == "http://x/api"


# ── connection errors ───────────────────────────────────────────────────────

REQUESTS_REFUSED = (
    "requests.exceptions.ConnectionError: HTTPConnectionPool(host='127.0.0.1', port=9): Max retries exceeded with url: /users "
    "(Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x1>: Failed to establish a new connection: "
    "[Errno 61] Connection refused'))"
)


def test_requests_refused():
    x = explain_error(REQUESTS_REFUSED)
    assert x["kind"] == "api"
    assert x["summary"] == "The API request could not be sent: nothing is listening on that address (ConnectionError)."
    assert x["url"] == "http://127.0.0.1:9/users"


def test_httpx_refused():
    x = explain_error("httpx.ConnectError: [Errno 111] Connection refused")
    assert "nothing is listening" in x["summary"] and "(ConnectError)" in x["summary"]


def test_dns():
    x = explain_error("requests.exceptions.ConnectionError: HTTPSConnectionPool(host='nope.invalid', port=443): Max retries exceeded with url: / (Caused by NameResolutionError(\"...: Failed to resolve 'nope.invalid' ([Errno 8] nodename nor servname provided, or not known)\"))")
    assert "could not be resolved" in x["summary"] and x["url"] == "https://nope.invalid:443/"
    assert "could not be resolved" in explain_error("httpx.ConnectError: [Errno -2] Name or service not known")["summary"]


def test_timeouts():
    assert explain_error("requests.exceptions.ReadTimeout: HTTPConnectionPool(host='h', port=80): Read timed out. (read timeout=1)")["summary"] == "The API did not answer in time (ReadTimeout)."
    assert "timed out" in explain_error("httpx.ConnectTimeout: timed out")["summary"]


def test_ssl():
    x = explain_error("requests.exceptions.SSLError: HTTPSConnectionPool(host='self-signed.badssl.com', port=443): Max retries exceeded with url: / (Caused by SSLError(SSLCertVerificationError(1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed')))")
    assert "TLS certificate" in x["summary"] and x["kind"] == "api"


def test_dropped():
    assert "dropped" in explain_error("httpx.RemoteProtocolError: Server disconnected without sending a response.")["summary"]


# ── response shape ──────────────────────────────────────────────────────────

def test_key_error():
    x = explain_error("KeyError: 'id'")
    assert x["kind"] == "assertion" and "'id'" in x["summary"] and "API tab" in x["hint"]


def test_assert_key_in_dict():
    x = explain_error("assert 'email' in {'id': 1, 'name': 'A'}")
    assert x["kind"] == "assertion" and "'email'" in x["summary"]


def test_jsonschema():
    msg = ("jsonschema.exceptions.ValidationError: 'email' is a required property\n\n"
           "Failed validating 'required' in schema:\n    {...}\n\nOn instance['user']:\n    {'id': 1}")
    x = explain_error(msg)
    assert x["matcher"] == "jsonschema"
    assert x["summary"] == "The response did not match the JSON schema at ['user']: 'email' is a required property"


def test_pydantic():
    msg = ("pydantic_core._pydantic_core.ValidationError: 2 validation errors for User\n"
           "email\n  Field required [type=missing, input_value={'id': 1}, input_type=dict]\n"
           "id\n  Input should be a valid integer [type=int_parsing, input_value='x', input_type=str]")
    x = explain_error(msg)
    assert x["matcher"] == "pydantic"
    assert x["summary"] == "The response did not match the User model: 2 fields failed (email: Field required; id: Input should be a valid integer)."


def test_bad_json():
    x = explain_error("requests.exceptions.JSONDecodeError: Expecting value: line 1 column 1 (char 0)")
    assert x["kind"] == "api" and x["summary"] == "The response body was not valid JSON."


# ── pytest and Python ───────────────────────────────────────────────────────

def test_pytest_timeout():
    x = explain_error("Failed: Timeout (>2.0s) from pytest-timeout.")
    assert x["kind"] == "test-timeout" and x["timeoutMs"] == 2000 and "2s" in x["summary"]
    assert explain_error("Failed: Timeout >1.5s")["timeoutMs"] == 1500


def test_generic_assert():
    x = explain_error("assert 'Asha' == 'Asha K'\n  \n  - Asha K\n  + Asha")
    assert x["kind"] == "assertion" and x["summary"] == "An assert did not pass: assert 'Asha' == 'Asha K'"
    assert "diff" in x["hint"]


def test_assert_with_custom_message():
    x = explain_error("total should include tax\nassert 99 == 108")
    assert x["kind"] == "assertion" and "total should include tax" in x["summary"]


def test_python_code_errors():
    x = explain_error("AttributeError: 'NoneType' object has no attribute 'json'")
    assert x["kind"] == "script" and "None" in x["hint"]
    assert kind("ModuleNotFoundError: No module named 'jsonschema'") == "script"
    assert kind("TypeError: 'int' object is not subscriptable") == "script"


def test_fixture_not_found():
    x = explain_error("fixture 'api_client' not found")
    assert x["kind"] == "script" and "'api_client'" in x["summary"]


def test_file_missing():
    x = explain_error("FileNotFoundError: [Errno 2] No such file or directory: 'data/users.csv'")
    assert x["kind"] == "file" and x["summary"] == "A file the test needs is missing: data/users.csv."


def test_pytest_fail_and_fallback():
    assert explain_error("Failed: login page never showed")["summary"] == "login page never showed"
    x = explain_error("RuntimeError: boom")
    assert x["kind"] == "thrown" and x["summary"] == "RuntimeError: boom"


# ── ported explain.ts rules still work (pytest-playwright errors) ───────────

@pytest.mark.parametrize("msg,expected", [
    ("Error: expect(locator).toHaveText(expected)\n\nLocator: locator('h1')\nExpected string: \"Welcome\"\nReceived string: \"Hello\"", "assertion"),
    ("TimeoutError: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('#buy')", "not-found"),
    ("Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/", "network"),
    ("Error: strict mode violation: locator('button') resolved to 3 elements", "ambiguous"),
    ("Test timeout of 30000ms exceeded.", "test-timeout"),
    ("Error: Target page, context or browser has been closed", "closed"),
])
def test_ts_rules(msg, expected):
    assert kind(msg) == expected


def test_ts_rules_details():
    x = explain_error("Error: expect(locator).toHaveText(expected)\n\nLocator: locator('h1')\nExpected string: \"Welcome\"\nReceived string: \"welcome\"")
    assert x["summary"] == "locator('h1') had the wrong text: expected \"Welcome\", got \"welcome\"."
    assert x["hint"].startswith("Only the letter case differs")
    x = explain_error("Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.test/")
    assert x["summary"] == "The browser could not reach https://nope.test/: the host name could not be resolved (ERR_NAME_NOT_RESOLVED)."
