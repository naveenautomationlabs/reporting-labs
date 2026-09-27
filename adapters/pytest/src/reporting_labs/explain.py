"""Turns a raw error message into a short, plain-language explanation.

Port of src/explain.ts (reporting-labs 0.6.1) plus rules for pytest and API tests.
Rule based, no network, no AI. The original message is always kept next to it.

Order:
  1. pytest and API rules (new here): timeouts, HTTP client errors, status mismatches,
     missing keys, schema and model validation, bad JSON.
  2. Python exceptions by type: missing file, missing fixture, code errors. They come
     before the explain.ts rules because those match loosely (ENOTFOUND, case-insensitive,
     also matches "ModuleNotFoundError").
  3. The explain.ts rules, in the same order (they also read pytest-playwright errors).
  4. Plain asserts and pytest.fail(), then the explain.ts fallbacks.

Only `kind` values and labels from explain.ts are used, because src/template.ts
styles the badge by kind.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

LABELS = {
    "not-found": "Element not found",
    "ambiguous": "Selector matches several elements",
    "not-visible": "Element not visible",
    "blocked": "Element covered by another element",
    "disabled": "Element disabled",
    "detached": "Element disappeared",
    "wrong-element": "Wrong element type",
    "assertion": "Assertion failed",
    "visual": "Screenshot mismatch",
    "navigation": "Page did not load",
    "network": "Site unreachable",
    "api": "API call failed",
    "test-timeout": "Test timed out",
    "hook-timeout": "Hook timed out",
    "closed": "Browser closed early",
    "script": "Error in test code",
    "file": "File not found",
    "thrown": "Test threw an error",
}

ANSI = re.compile(r"\x1b\[[0-9;]*m")


def secs(ms: float) -> str:
    if ms >= 1000:
        return f"{ms / 1000:.{1 if ms % 1000 else 0}f}s"
    return f"{ms:g}ms"


def short(s: str, n: int = 120) -> str:
    return s[: n - 1] + "…" if len(s) > n else s


def pick(msg: str, pattern: str, flags: int = 0) -> Optional[str]:
    m = re.search(pattern, msg, flags)
    return m.group(1) if m else None


def _out(kind: str, summary: str, hint: Optional[str] = None, **extra: Any) -> Dict[str, Any]:
    data: Dict[str, Any] = {"kind": kind, "label": LABELS[kind], "summary": summary}
    if hint is not None:
        data["hint"] = hint
    for k, v in extra.items():
        if v is not None:
            data[k] = v
    return data


def explain_error(raw: str) -> Optional[Dict[str, Any]]:
    msg = ANSI.sub("", raw or "").strip()
    if not msg:
        return None
    first = msg.split("\n")[0].strip()
    return (_pytest_api_rules(msg, first) or _python_error_rules(msg, first) or _playwright_rules(msg, first)
            or _python_assert_rules(msg, first) or _fallback(first))


# ── 1. pytest and API rules ─────────────────────────────────────────────────

CLIENT_ERROR = re.compile(
    r"\b(ConnectionError|ConnectError|ConnectTimeout|ReadTimeout|WriteTimeout|PoolTimeout|TimeoutException|"
    r"SSLError|NewConnectionError|MaxRetryError|NameResolutionError|RemoteProtocolError|ReadError|"
    r"ConnectionRefusedError|ConnectionResetError|ProxyError|gaierror|requests\.exceptions\.Timeout)\b"
)


def _client_url(msg: str) -> Optional[str]:
    url = pick(msg, r"(https?://[^\s'\")]+)")
    if url:
        return url
    m = re.search(r"(HTTPS?)ConnectionPool\(host='([^']+)', port=(\d+)\)(?:: Max retries exceeded with url: (\S+))?", msg)
    if m:
        return f"{m.group(1).lower()}://{m.group(2)}:{m.group(3)}{m.group(4) or ''}"
    return None


def _status_hint(code: int) -> str:
    if code in (401, 403):
        return "The request was not allowed. Check the token or credentials the test sends, and that they have not expired."
    if code == 404:
        return "Nothing was found at that URL. Check the path and the id the test used. The record may never have been created, or was deleted."
    if code in (400, 409, 415, 422):
        return "The API rejected the request. The response body in the API tab usually names the field or rule that failed."
    if code == 429:
        return "The API is rate limiting the tests. Slow down, run fewer workers against it, or ask for a higher limit."
    if 500 <= code < 600:
        return "The server failed. Check the API logs. The response body in the API tab often says why."
    if 200 <= code < 400:
        return "The call worked but returned a different code. Check whether the API contract changed (for example 200 vs 201)."
    return "Compare the request in the API tab with what the API expects."


def _pytest_api_rules(msg: str, first: str) -> Optional[Dict[str, Any]]:
    # pytest-timeout: "Failed: Timeout (>2.0s) from pytest-timeout." or "Failed: Timeout >2.0s"
    m = re.search(r"Timeout \(?>([\d.]+)s\)?", first)
    if m and first.startswith("Failed:"):
        ms = round(float(m.group(1)) * 1000)
        return _out("test-timeout", f"The whole test took longer than {secs(ms)}.",
                    "Find the slow step in the Steps list or the API tab. Raise the timeout only if the flow is really that long.",
                    timeoutMs=ms)

    # requests / httpx / urllib3: the request never got an answer
    if CLIENT_ERROR.search(msg):
        code = pick(first, r"^(?:\w+\.)*(\w+):") or "ConnectionError"
        url = _client_url(msg)
        if re.search(r"SSLError|SSL:|CERTIFICATE_VERIFY_FAILED|certificate verify failed", msg):
            reason, hint = "the TLS certificate was rejected", "Check http vs https in the URL and the CA bundle (REQUESTS_CA_BUNDLE or SSL_CERT_FILE). Do not turn off verification outside local runs."
        elif re.search(r"NameResolutionError|Name or service not known|nodename nor servname|getaddrinfo failed|Temporary failure in name resolution|No address associated|gaierror|Errno -[23]\]|Errno 8\]|Errno 11001\]", msg):
            reason, hint = "the host name could not be resolved", "Check the host name in the base URL, and DNS, VPN or proxy settings."
        elif re.search(r"Connection refused|ECONNREFUSED|Errno 61\]|Errno 111\]|Errno 10061\]", msg):
            reason, hint = "nothing is listening on that address", "Check the base URL and that the API is up. In CI, make sure the service starts before the tests."
        elif re.search(r"ReadTimeout|Read timed out|WriteTimeout|PoolTimeout", msg):
            return _out("api", f"The API did not answer in time ({code}).", "The API may be slow or hanging. Check its logs, or raise the client timeout.", url=url)
        elif re.search(r"timed out|Timeout|ETIMEDOUT", msg):
            reason, hint = "the connection timed out", "The host did not answer. Check the URL, the port, and firewall or VPN settings."
        elif re.search(r"Connection reset|Connection aborted|RemoteDisconnected|RemoteProtocolError|Server disconnected|ECONNRESET|Errno 54\]|Errno 104\]", msg):
            reason, hint = "the connection was dropped", "The server closed the connection. Check the API logs for a crash, or a proxy in between."
        else:
            reason, hint = "the connection failed", "Check the base URL and that the API is up."
        return _out("api", f"The API request could not be sent: {reason} ({code}).", hint, url=url)

    # raise_for_status()
    m = re.search(r"(\d{3}) (?:Client|Server) Error: (.*?) for url: (\S+)", msg) or re.search(r"(?:Client|Server) error '(\d{3}) ([^']*)' for url '([^']+)'", msg)
    if m:
        code = int(m.group(1))
        return _out("api", f"The API answered {code} {m.group(2)}.".replace(" .", "."), _status_hint(code), url=m.group(3), matcher="raise_for_status")

    # assert response.status_code == 200  ->  "assert 404 == 200" (after the custom message, if there is one)
    lines = [re.sub(r"^AssertionError:\s*", "", line).strip() for line in msg.split("\n")]
    assert_line = next((line for line in lines if line.startswith("assert ")), first)
    m = re.match(r"assert (\d{3}) (==|!=|in|not in) (.+)$", assert_line)
    if m:
        got, want = int(m.group(1)), m.group(3).strip()
        looks_http = re.search(r"status|<Response \[", msg) or (100 <= got < 600 and re.fullmatch(r"[1-5]\d\d", want))
        if looks_http and m.group(2) in ("==", "in"):
            return _out("api", f"The API returned status {got}, the test expected {short(want, 40)}.", _status_hint(got), matcher="status_code")
    # assert response.ok  ->  "assert False\n +  where False = <Response [500]>.ok"
    m = re.search(r"where False = <Response \[(\d{3})", msg)
    if m and assert_line.startswith("assert "):
        got = int(m.group(1))
        return _out("api", f"The API returned status {got}, the test expected a success status.", _status_hint(got), matcher="status_code")

    # missing key in a response
    key = pick(first, r"^KeyError: (.+)$")
    if key is None:
        key = pick(first, r"^assert (['\"][^'\"]+['\"]) in [{\[]")
    if key is not None:
        return _out("assertion", f"The key {short(key, 60)} was not there. If it came from an API response, the response did not have the expected shape.",
                    "Open the API tab and look at the response body. The API may have returned an error object, an empty list, or a renamed field.")

    # jsonschema
    if re.search(r"jsonschema\.exceptions\.ValidationError|Failed validating '", msg):
        detail = pick(first, r"^(?:\w+\.)*ValidationError: (.+)$") or first
        where = pick(msg, r"^On instance(\[[^\n]*\])?:", re.M)
        at = f" at {where}" if where else ""
        return _out("assertion", f"The response did not match the JSON schema{at}: {short(detail, 100)}",
                    "Compare the response body in the API tab with the schema. Either the API changed or the schema is out of date.",
                    matcher="jsonschema")

    # pydantic
    m = re.search(r"(\d+) validation errors? for (\w+)", msg)
    if m:
        fields = re.findall(r"^(\S[^\n]*)\n\s+([^\n\[]+?)\s*\[type=", msg, re.M)
        detail = "; ".join(f"{f}: {e}" for f, e in fields[:3])
        n = int(m.group(1))
        return _out("assertion", f"The response did not match the {m.group(2)} model: {n} field{'s' if n != 1 else ''} failed" + (f" ({short(detail, 100)})." if detail else "."),
                    "Compare the response body in the API tab with the model. Either the API changed or the model is out of date.",
                    matcher="pydantic")

    # response.json() on something that is not JSON
    if re.search(r"JSONDecodeError|Expecting value: line \d+ column \d+", msg):
        return _out("api", "The response body was not valid JSON.",
                    "It may be an HTML error page, an empty body (204) or a proxy page. Check the response in the API tab.")
    return None


# ── 3. explain.ts rules ─────────────────────────────────────────────────────

def _playwright_rules(msg: str, first: str) -> Optional[Dict[str, Any]]:
    out = _out
    locator = pick(msg, r"(?:waiting for|Locator:\s*|resolved to \d+ elements?:?\s*|locator\(['\"]|)(locator\([^\n]*?\))(?:\s|$)", re.M) \
        or pick(msg, r"(?:waiting for|Locator:\s*)\s*(getBy\w+\([^\n]*?\)(?:\.\w+\([^\n]*?\))*)", re.M)
    t = pick(msg, r"(?:Timeout|timeout of|Timed out)\s+(\d+)ms", re.I)
    timeout_ms = int(t) if t and int(t) else None
    action = pick(first, r"^(?:Error: |TimeoutError: )?([a-zA-Z]+\.[a-zA-Z]+):")
    url = pick(msg, r"(?:navigating to|at)\s+\"?(https?://[^\s\"]+)")

    # Whole-test and hook timeouts
    m = re.search(r"\"(beforeAll|beforeEach|afterAll|afterEach)\" hook timeout of (\d+)ms exceeded", msg)
    if m:
        return out("hook-timeout", f"The {m.group(1)} hook took longer than {secs(int(m.group(2)))}.", "Look at what the hook does (login, seeding data, starting a server). Raise the hook timeout only if that work really needs more time.", timeoutMs=int(m.group(2)))
    m = re.search(r"Test timeout of (\d+)ms exceeded(?: while (?:running|tearing down) \"(\w+)\" hook)?", msg)
    if m:
        ms = int(m.group(1))
        if m.group(2):
            return out("hook-timeout", f"The {m.group(2)} hook did not finish within the test timeout of {secs(ms)}.", "Check the steps in the hook. A slow login or a waiting call is the usual cause.", timeoutMs=ms)
        where = (f" It was stuck in {action}" + (f" on {locator}" if locator else "") + ".") if action else ""
        return out("test-timeout", f"The whole test took longer than {secs(ms)}.{where}", "Find the slow step in the Steps list below. Raise timeout in playwright.config.ts only if the flow is really that long.", timeoutMs=ms, action=action, locator=locator)

    # Strict mode
    m = re.search(r"strict mode violation: (.+?) resolved to (\d+) elements", msg, re.S)
    if m:
        return out("ambiguous", f"{short(m.group(1).strip())} matched {m.group(2)} elements, Playwright needs exactly one.", "Make the selector more specific, or pick one with .first(), .nth(i) or a filter such as { hasText }.", locator=m.group(1).strip())

    # Assertions (expect)
    m = re.search(r"expect\((?:locator|page|received|value)\)\.(\w+)(?:\(\w*\))?", msg) or re.search(r"waiting for expect\((?:locator|page)\)\.(\w+)", msg)
    if m or re.match(r"Error: expect\(", first) or re.match(r"Error: Timed out \d+ms waiting for expect", first):
        matcher = m.group(1) if m else None
        expected = pick(msg, r"^Expected(?:[^:\n]{0,40})?:[ \t]*(.+)$", re.M)
        received = pick(msg, r"^Received(?:[^:\n]{0,40})?:[ \t]*(.+)$", re.M)
        expected = expected.strip() if expected is not None else None
        received = received.strip() if received is not None else None
        not_found = bool(re.search(r"element\(s\) not found|locator resolved to 0 elements|not found", msg, re.I)) and not re.search(r"unexpected value", msg, re.I)
        base = dict(matcher=matcher, locator=locator, timeoutMs=timeout_ms)
        within = f" within {secs(timeout_ms)}" if timeout_ms else ""
        if matcher == "toHaveScreenshot" or re.search(r"Screenshot comparison failed|pixels \(ratio [\d.]+ of all image pixels\) are different", msg):
            px = pick(msg, r"(\d+) pixels \(ratio ([\d.]+)")
            return out("visual", f"The page looks different from the baseline: {px} pixels changed." if px else "The page looks different from the baseline screenshot.", "Open the visual comparison below. If the new look is intended, update the baseline with --update-snapshots.", **base)
        if not_found and locator:
            return out("not-found", f"{locator} was not on the page{within}, so {matcher or 'the check'} could not run.", "Check the selector, and whether the element is inside an iframe, behind a login, or only shown after a click.", **base)
        if matcher in ("toBeVisible", "toBeHidden"):
            want = "visible" if matcher == "toBeVisible" else "hidden"
            got = received if received is not None else ("hidden" if want == "visible" else "visible")
            return out("not-visible" if matcher == "toBeVisible" else "assertion", f"{locator or 'The element'} was expected to be {want}{within} but was {got}.", "The element may still be loading, be hidden by CSS, or sit inside a closed menu or dialog." if want == "visible" else "Something kept the element on screen. Check the step that should hide it.", **base)
        if matcher == "toHaveURL":
            return out("assertion", f"The page URL was {received or 'different'}, expected {expected or 'another URL'}.", "The navigation may not have happened yet, or it went to a different page (a redirect, a login screen, an error page).", **base)
        if matcher == "toHaveCount":
            return out("assertion", f"{locator or 'The selector'} matched {received or 'a different number of'} elements, expected {expected or 'another count'}.", "The list may not have finished loading, or the selector also matches other elements.", **base)
        if matcher and re.fullmatch(r"toBeEnabled|toBeDisabled|toBeChecked|toBeEditable|toBeFocused|toBeEmpty|toBeAttached|toBeInViewport", matcher):
            state = re.sub(r"^toBe", "", matcher).lower()
            return out("assertion", f"{locator or 'The element'} was not in the expected state ({state})" + (f": it was {received}" if received else "") + ".", "Check the step before this one. The element may still be loading or waiting on a previous action.", **base)
        if expected is not None and received is not None:
            what = "value"
            if matcher:
                for word, name in (("text", "text"), ("value", "value"), ("attribute", "attribute"), ("title", "title"), ("class", "class")):
                    if word in matcher.lower():
                        what = name
                        break
            who = f"{locator} had the wrong {what}" if locator else f"The {what} was wrong"
            same_but_case = re.match(r"[\"']", expected) and re.match(r"[\"']", received) and expected.lower() == received.lower()
            return out("assertion", f"{who}: expected {short(expected, 80)}, got {short(received, 80)}.", "Only the letter case differs. Use toHaveText with { ignoreCase: true } if that is fine." if same_but_case else "Compare expected and received below. A copy change, a data change or a timing issue are the usual causes.", **base)
        return out("assertion", f"{'expect().' + matcher + '()' if matcher else 'An expect()'} did not pass" + (f" for {locator}" if locator else "") + ".", "See the full message below for the expected and received values.", **base)

    # Navigation and network
    m = re.search(r"net::(ERR_[A-Z_]+)|NS_ERROR_([A-Z_]+)|Could not connect to server|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|certificate|ERR_CERT", msg, re.I)
    if m:
        code = (m.group(1) or m.group(2) or m.group(0)).upper()
        if "REFUSED" in code:
            reason = "nothing is listening on that address"
        elif re.search(r"NOT_RESOLVED|ENOTFOUND|EAI_AGAIN", code):
            reason = "the host name could not be resolved"
        elif re.search(r"CERT", code, re.I):
            reason = "the TLS certificate was rejected"
        elif re.search(r"TIMED_OUT|ETIMEDOUT", code):
            reason = "the connection timed out"
        elif re.search(r"RESET|ABORTED", code):
            reason = "the connection was dropped"
        else:
            reason = "the connection failed"
        if action and action.startswith("apiRequestContext."):
            return out("api", f"The API request could not be sent: {reason} ({code}).", "Check the base URL and that the API is up. In CI, check that the service started before the tests.", action=action, url=url)
        return out("network", f"The browser could not reach {url or 'the site'}: {reason} ({code}).", "Check baseURL, that the app is running, and VPN or proxy settings. In CI, make sure the web server starts before the tests.", action=action, url=url)
    if action and action.startswith("apiRequestContext."):
        if re.search(r"Request timed out|Timeout \d+ms exceeded", msg):
            return out("api", "The API request did not answer" + (f" within {secs(timeout_ms)}" if timeout_ms else " in time") + ".", "The API may be slow or hanging. Check its logs, or raise the request timeout.", action=action, url=url, timeoutMs=timeout_ms)
        if "Request context disposed" in msg:
            return out("api", "The API request was made after its request context was closed.", "Make sure request.dispose() or the end of the test does not run before this call.", action=action)
        return out("api", f"The API call {action} failed: {short(re.sub(r'^Error: ', '', first))}", "See the full message below and the API tab for the request.", action=action, url=url)
    if action and re.fullmatch(r"(page|frame)\.(goto|reload|goBack|goForward|waitForURL|waitForLoadState|waitForNavigation)", action):
        if re.search(r"Timeout \d+ms exceeded|Navigation timeout", msg, re.I):
            return out("navigation", f"{url or 'The page'} did not finish loading within {secs(timeout_ms) if timeout_ms else 'the timeout'}.", "The app may be slow, stuck on a request, or redirecting in a loop. Try waitUntil: \"domcontentloaded\" if the page keeps long-running requests open.", action=action, url=url, timeoutMs=timeout_ms)
        if "interrupted by another navigation" in msg:
            return out("navigation", "The page navigated somewhere else while this navigation was in progress.", "A redirect or a click started another navigation. Wait for the final URL instead.", action=action, url=url)
        return out("navigation", f"{action} failed: {short(re.sub(r'^(Error|TimeoutError): ', '', first))}", "See the full message below.", action=action, url=url)
    if re.search(r"Navigation timeout of \d+ms exceeded|page\.waitForNavigation", msg):
        return out("navigation", f"The page did not finish loading within {secs(timeout_ms) if timeout_ms else 'the timeout'}.", "The app may be slow or stuck on a request. Check the Network tab in a trace.", url=url, timeoutMs=timeout_ms)

    # Closed / detached
    if re.search(r"Target page, context or browser has been closed|Target closed|Browser has been closed|Browser closed|browser has disconnected|Page closed|Context closed", msg, re.I):
        return out("closed", "The browser or page was closed before this step could run.", "A previous step closed it, the test ended early, or the browser crashed. Look at the step just before this one.", action=action)
    if re.search(r"Execution context was destroyed|most likely because of a navigation", msg):
        return out("detached", "The page navigated away while this step was running.", "Wait for the navigation to finish (for example await page.waitForURL) before touching the page.", action=action, locator=locator)
    if re.search(r"not attached to the DOM|element was detached|Element is not attached", msg, re.I):
        return out("detached", f"{locator or 'The element'} was removed from the page while Playwright was using it.", "The UI re-rendered the element. Re-locate it after the change, or wait for the update to finish.", action=action, locator=locator)

    # Action timeouts on a locator
    if action and re.search(r"Timeout \d+ms exceeded", msg):
        base = dict(action=action, locator=locator, timeoutMs=timeout_ms)
        for_t = f" for {secs(timeout_ms)}" if timeout_ms else ""
        within = f" within {secs(timeout_ms)}" if timeout_ms else ""
        el = locator or "The element"
        if "intercepts pointer events" in msg:
            by = pick(msg, r"\n\s*-?\s*(<[^>]+>)[^\n]*intercepts pointer events")
            return out("blocked", f"{el} was there, but {by + ' ' if by else 'another element '}was covering it, so the {action.split('.')[1]} never landed.", "A modal, cookie banner, toast or loading overlay is on top. Close it first, or wait for it to disappear.", **base)
        if "element is not visible" in msg:
            return out("not-visible", f"{el} exists but stayed hidden{for_t}.", "It may be inside a closed menu, collapsed section or hidden tab, or hidden by CSS. Open the container first.", **base)
        if re.search(r"element is not enabled|is disabled", msg):
            return out("disabled", f"{el} stayed disabled{for_t}.", "A form may be invalid or still loading. Fill the required fields or wait for the button to enable.", **base)
        if "element is outside of the viewport" in msg:
            return out("not-visible", f"{el} was outside the visible area{for_t}.", "Scroll it into view, or check for a fixed layout that keeps it off screen.", **base)
        if re.search(r"not an? <input>|not an <input>|Element is not an", msg):
            return out("wrong-element", f"{el} is not the kind of element this action works on.", "For example fill() needs an <input> or <textarea>. Check the selector points at the right element.", **base)
        if "waiting for" in msg and "locator resolved to" not in msg:
            return out("not-found", f"{el} was not on the page{within}, so {action} could not run.", "Check the selector. The element may be inside an iframe, behind a login, or only shown after another step.", **base)
        if "waiting for element to be visible, enabled and stable" in msg:
            return out("not-visible", f"{el} was found but never became ready (visible, enabled and stable){within}.", "The element may be animating, hidden, or disabled. Wait for the animation or the loading state to finish.", **base)
        return out("not-found", f"{action} did not complete{within}" + (f" on {locator}" if locator else "") + ".", "See the call log below for what Playwright was waiting on.", **base)
    if action and re.search(r"Element is not an? <input>|not an <input>", msg):
        return out("wrong-element", f"{locator or 'The element'} is not the kind of element this action works on.", "For example fill() needs an <input> or <textarea>. Check the selector.", action=action, locator=locator)
    if action and re.search(r"did not find some options|Option .* not found", msg):
        return out("assertion", "selectOption could not find the requested option" + (f" in {locator}" if locator else "") + ".", "Check the option value or label. Options may load later than the select element.", action=action, locator=locator)

    # Files
    if "ENOENT: no such file or directory" in msg:
        f = pick(msg, r"open '([^']+)'|'([^']+)'") or pick(msg, r"directory, \w+ '([^']+)'")
        return out("file", "A file the test needs is missing" + (f": {f}" if f else "") + ".", "Check the path, and that the file is committed or generated before the run (a download, a fixture, a baseline screenshot).")
    return None


# ── 2. Python exceptions by type ────────────────────────────────────────────

def _python_error_rules(msg: str, first: str) -> Optional[Dict[str, Any]]:
    f = pick(msg, r"FileNotFoundError: \[Errno 2\] No such file or directory: '([^']+)'")
    if f is not None or first.startswith("FileNotFoundError"):
        return _out("file", "A file the test needs is missing" + (f": {f}" if f else "") + ".", "Check the path, and that the file is committed or generated before the run (test data, a fixture file, a schema).")

    name = pick(msg, r"fixture '([^']+)' not found")
    if name:
        return _out("script", f"The fixture '{name}' does not exist.", "Check the name, and that the conftest.py that defines it is in scope for this test.")

    m = re.match(r"(?:\w+\.)*(TypeError|AttributeError|NameError|UnboundLocalError|ImportError|ModuleNotFoundError|IndexError|ZeroDivisionError|RecursionError|SyntaxError|IndentationError): (.+)$", first)
    if m:
        kind, text = m.group(1), m.group(2)
        if "NoneType" in text:
            hint = "Something was None at that point: an API response field, a fixture, a page object attribute."
        elif kind in ("NameError", "UnboundLocalError"):
            hint = "A variable or import is missing."
        elif kind in ("ImportError", "ModuleNotFoundError"):
            hint = "A module is missing. Install it in the test environment, or fix the import path."
        elif kind == "IndexError":
            hint = "A list was shorter than expected. If it came from an API response, the list may be empty."
        elif kind == "AttributeError":
            hint = "A method or field is being read on the wrong object, or it was renamed."
        else:
            hint = "This is a bug in the test or a helper, not in the app."
        return _out("script", f"{kind} in the test code: {short(text)}", hint)
    return None


# ── 4. Plain asserts and pytest.fail(), then the explain.ts fallbacks ───────

def _python_assert_rules(msg: str, first: str) -> Optional[Dict[str, Any]]:
    if re.search(r"^assert ", msg, re.M) or first.startswith("AssertionError"):
        lines = msg.split("\n")
        has_diff = any(line.startswith("- ") or line.strip().startswith("- ") for line in lines) and any(line.startswith("+ ") or line.strip().startswith("+ ") for line in lines)
        hint = "Compare the two values in the diff below." if has_diff else "See the full message below for the values pytest compared."
        text = re.sub(r"^AssertionError:?\s*", "", first) or "assert"
        return _out("assertion", f"An assert did not pass: {short(text)}", hint)

    m = re.match(r"Failed: (.+)$", first)
    if m:
        return _out("thrown", short(m.group(1)), "The test called pytest.fail(). The stack trace below points at the line.")
    return None


def _fallback(first: str) -> Dict[str, Any]:
    m = re.match(r"(TypeError|ReferenceError|SyntaxError|RangeError): (.+)$", first)
    if m:
        text = m.group(2)
        if "is not a function" in text:
            hint = "A method is being called on the wrong object, or a helper was not imported."
        elif re.search(r"Cannot read propert|of undefined|of null", text):
            hint = "Something was undefined at that point: an API response, a fixture, a page object field."
        elif "is not defined" in text:
            hint = "A variable or import is missing."
        elif "JSON" in text:
            hint = "The response was not valid JSON. It may be an HTML error page."
        else:
            hint = "This is a bug in the test or a helper, not in the app."
        return _out("script", f"{m.group(1)} in the test code: {short(text)}", hint)
    if re.match(r"Error: (.+)", first) and not re.match(r"Error: (locator|page|frame|browser|expect|apiRequestContext)", first):
        return _out("thrown", short(re.sub(r"^Error: ", "", first)), "The test (or a helper) threw this error on purpose or via a failed check. The stack trace below points at the line.")
    return _out("thrown", short(first), "See the full message and stack trace below.")
