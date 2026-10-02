"""reportingLabs for pytest.

    import reporting_labs as rl

    rl.meta(priority="P1", owner="asha", feature="checkout")
    rl.log("cart total", 99.0)
    rl.test_data({"user": "asha", "password": "x"}, "Login")
    with rl.step("Create the order"):
        ...
    rl.api(method="GET", url="/health", status=200, duration=12)

Every helper does nothing when the report is off (no --rl) or when it runs outside a test.
Secrets in logs, test data and API calls are masked before the report is written.
"""
from __future__ import annotations

import json
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

from . import context
from .context import jsonable, now_ms

__all__ = ["meta", "log", "test_data", "step", "api"]


def meta(**values: Any) -> None:
    """Report metadata for the current test: priority, severity, owner, feature, epic, story, issue...

    Any other key is kept too and shows on the test. Same as meta() in the Playwright adapter.
    """
    attempt = context.current()
    if attempt is None:
        return
    for k, v in values.items():
        if v is None:
            continue
        attempt.annotations.append({"type": k.lower(), "description": str(v)})


def log(message: Any, *values: Any) -> None:
    """A timestamped log line. Lines with "error"/"fail" show red, "warn" amber."""
    attempt = context.current()
    if attempt is None:
        return
    parts = [str(message)] + [v if isinstance(v, str) else _js_stringify(v) for v in values]
    attempt.logs.append({"t": now_ms(), "msg": " ".join(parts)})


def _js_stringify(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    return json.dumps(jsonable(v), ensure_ascii=False, separators=(",", ":"))


def _looks_like_csv(text: str) -> bool:
    lines = [line for line in text.replace("\r", "").split("\n") if line.strip()]
    return len(lines) >= 2 and "," in lines[0]


def test_data(data: Any, name: str = "Test data") -> None:
    """The data this test used.

    - dict                 -> key/value block
    - list of dicts        -> table
    - CSV string           -> table (a header line with commas, then rows)
    - any other string     -> text
    Sensitive keys (password, token, secret, apiKey, authorization, cookie...) show as ****.
    """
    attempt = context.current()
    if attempt is None:
        return
    if isinstance(data, str):
        entry = {"name": name, "kind": "csv" if _looks_like_csv(data) else "text", "value": data}
    else:
        entry = {"name": name, "kind": "json", "value": jsonable(data)}
    attempt.data.append(entry)


test_data.__test__ = False  # type: ignore[attr-defined]  # not a test, even when imported into a test module


@contextmanager
def step(title: str) -> Iterator[None]:
    """A named step. Steps nest. An exception marks the step as failed and is raised again."""
    attempt = context.current()
    if attempt is None:
        yield
        return
    node: Dict[str, Any] = {"title": str(title), "category": "test.step", "duration": 0, "steps": []}
    parent = attempt.open_steps[-1]["steps"] if attempt.open_steps else attempt.steps
    parent.append(node)
    attempt.open_steps.append(node)
    t0 = time.perf_counter()
    try:
        yield
    except BaseException as e:
        node["error"] = _error_text(e)
        raise
    finally:
        node["duration"] = round((time.perf_counter() - t0) * 1000, 3)
        if attempt.open_steps and attempt.open_steps[-1] is node:
            attempt.open_steps.pop()


def _error_text(e: BaseException) -> str:
    text = str(e)
    if isinstance(e, AssertionError):
        return text or "AssertionError"
    return f"{type(e).__name__}: {text}" if text else type(e).__name__


_CAMEL = {"request_headers": "requestHeaders", "request_body": "requestBody",
          "response_headers": "responseHeaders", "response_body": "responseBody"}


def api(call: Optional[Dict[str, Any]] = None, **fields: Any) -> None:
    """Record an API call made with any client. Shows in the test and in the API tab.

        rl.api(method="POST", url="/v1/orders", status=201, duration=138,
               request_body=payload, response_body=resp.json())

    You can also pass one dict with the TypeScript names (requestHeaders, responseBody...).
    Authorization and Cookie headers, tokens and secret-looking fields are masked.
    """
    attempt = context.current()
    if attempt is None:
        return
    merged: Dict[str, Any] = dict(call or {})
    for k, v in fields.items():
        merged[_CAMEL.get(k, k)] = v
    entry = {k: v for k, v in merged.items() if v is not None}
    entry["method"] = str(entry.get("method", "GET")).upper()
    entry["url"] = str(entry.get("url", ""))
    for k in ("requestBody", "responseBody"):
        if isinstance(entry.get(k), (bytes, bytearray)):
            entry[k] = _decode_body(bytes(entry[k]))
    attempt.api.append(jsonable(entry))


def _decode_body(raw: bytes) -> Any:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return f"<binary {len(raw)} bytes>"
    try:
        return json.loads(text)
    except ValueError:
        return text

