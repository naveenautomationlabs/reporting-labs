"""Automatic API capture for requests and httpx. Turn it on with --rl-capture-api or rl_capture_api = true.

Patches requests.Session.send (so requests.get(), Session().post()... are all covered),
httpx.Client.send and httpx.AsyncClient.send. Each call becomes one ApiCall on the
current test: method, URL, status, duration in ms, both header sets and both bodies.
Bodies are parsed as JSON when they are JSON, kept as text when they are text, and
cut at the size limit. A call that never got an answer (refused, DNS, timeout, TLS)
is recorded with no status and the error as the response body, like src/auto.ts.

Calls made outside a test are not recorded. See context.py for fixtures.
Masking happens later, when the report is built.
"""
from __future__ import annotations

import json
import time
from contextvars import ContextVar
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple
from urllib.parse import parse_qsl

from . import context
from .config import DEFAULT_API_MAX_BODY
from .context import jsonable

TEXT_TYPES = ("json", "text", "xml", "html", "javascript", "x-www-form-urlencoded", "graphql")

_max_body = DEFAULT_API_MAX_BODY
_originals: List[Tuple[Any, str, Callable[..., Any]]] = []
_inside: ContextVar[bool] = ContextVar("reporting_labs_in_send", default=False)


def _is_text(content_type: str) -> bool:
    ct = content_type.lower()
    return any(t in ct for t in TEXT_TYPES)


def _body(raw: Any, content_type: str = "") -> Any:
    """Bytes or str from a request or response, as the report shows it."""
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    if not isinstance(raw, (bytes, bytearray)):
        return "<stream>"
    raw = bytes(raw)
    if not raw:
        return None
    if content_type and not _is_text(content_type):
        return f"<{content_type.split(';')[0].strip()} {len(raw)} bytes>"
    if len(raw) > _max_body:
        return raw[:_max_body].decode("utf-8", "replace") + f"\n… truncated ({len(raw)} bytes)"
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return f"<binary {len(raw)} bytes>"
    if "x-www-form-urlencoded" in content_type.lower():
        return dict(parse_qsl(text, keep_blank_values=True))
    try:
        return json.loads(text)
    except ValueError:
        return text


def _headers(h: Optional[Mapping[str, Any]]) -> Dict[str, str]:
    return {str(k): str(v) for k, v in (h or {}).items()}


def _content_type(h: Mapping[str, str]) -> str:
    for k, v in h.items():
        if k.lower() == "content-type":
            return v
    return ""


def _record(call: Dict[str, Any], attempt: Optional[context.Attempt]) -> None:
    if attempt is not None:
        attempt.api.append(jsonable({k: v for k, v in call.items() if v is not None}))


def _failed(e: BaseException) -> str:
    return f"Request failed: {type(e).__name__}: {e}"


# ── requests ────────────────────────────────────────────────────────────────

def _patch_requests() -> None:
    try:
        import requests
    except ImportError:
        return
    original = requests.Session.send

    def send(self: Any, request: Any, **kwargs: Any) -> Any:
        attempt = context.current()
        if attempt is None or _inside.get():  # redirects call send() again; record the outer call only
            return original(self, request, **kwargs)
        token = _inside.set(True)
        t0 = time.perf_counter()
        req_headers = _headers(request.headers)
        call: Dict[str, Any] = {"method": str(request.method or "GET").upper(), "url": request.url,
                                "requestHeaders": req_headers, "requestBody": _body(request.body, _content_type(req_headers))}
        try:
            response = original(self, request, **kwargs)
        except BaseException as e:
            call["duration"] = round((time.perf_counter() - t0) * 1000)
            call["responseBody"] = _failed(e)
            _record(call, attempt)
            raise
        finally:
            _inside.reset(token)
        call["duration"] = round((time.perf_counter() - t0) * 1000)
        call["url"] = response.url or call["url"]
        call["status"] = response.status_code
        call["responseHeaders"] = _headers(response.headers)
        if kwargs.get("stream"):
            call["responseBody"] = "<streamed response, not read>"
        else:
            call["responseBody"] = _body(response.content, _content_type(call["responseHeaders"]))
        _record(call, attempt)
        return response

    requests.Session.send = send  # type: ignore[method-assign]
    _originals.append((requests.Session, "send", original))


# ── httpx ───────────────────────────────────────────────────────────────────

def _httpx_request(request: Any) -> Dict[str, Any]:
    headers = _headers(request.headers)
    try:
        body = _body(request.content, _content_type(headers))
    except Exception:  # a streaming request body that was not read
        body = "<stream>"
    return {"method": str(request.method).upper(), "url": str(request.url), "requestHeaders": headers, "requestBody": body}


def _httpx_response(call: Dict[str, Any], response: Any, stream: bool) -> None:
    call["url"] = str(response.url) if getattr(response, "url", None) else call["url"]
    call["status"] = response.status_code
    call["responseHeaders"] = _headers(response.headers)
    if stream:
        call["responseBody"] = "<streamed response, not read>"
    else:
        try:
            call["responseBody"] = _body(response.content, _content_type(call["responseHeaders"]))
        except Exception:
            call["responseBody"] = "<not read>"


def _patch_httpx() -> None:
    try:
        import httpx
    except ImportError:
        return
    sync_original = httpx.Client.send
    async_original = httpx.AsyncClient.send

    def send(self: Any, request: Any, *args: Any, **kwargs: Any) -> Any:
        attempt = context.current()
        if attempt is None:
            return sync_original(self, request, *args, **kwargs)
        call = _httpx_request(request)
        t0 = time.perf_counter()
        try:
            response = sync_original(self, request, *args, **kwargs)
        except BaseException as e:
            call["duration"] = round((time.perf_counter() - t0) * 1000)
            call["responseBody"] = _failed(e)
            _record(call, attempt)
            raise
        call["duration"] = round((time.perf_counter() - t0) * 1000)
        _httpx_response(call, response, bool(kwargs.get("stream")))
        _record(call, attempt)
        return response

    async def async_send(self: Any, request: Any, *args: Any, **kwargs: Any) -> Any:
        attempt = context.current()
        if attempt is None:
            return await async_original(self, request, *args, **kwargs)
        call = _httpx_request(request)
        t0 = time.perf_counter()
        try:
            response = await async_original(self, request, *args, **kwargs)
        except BaseException as e:
            call["duration"] = round((time.perf_counter() - t0) * 1000)
            call["responseBody"] = _failed(e)
            _record(call, attempt)
            raise
        call["duration"] = round((time.perf_counter() - t0) * 1000)
        _httpx_response(call, response, bool(kwargs.get("stream")))
        _record(call, attempt)
        return response

    httpx.Client.send = send  # type: ignore[method-assign]
    httpx.AsyncClient.send = async_send  # type: ignore[method-assign]
    _originals.append((httpx.Client, "send", sync_original))
    _originals.append((httpx.AsyncClient, "send", async_original))


def install(max_body: int = DEFAULT_API_MAX_BODY) -> None:
    global _max_body
    _max_body = max_body
    if _originals:
        return
    _patch_requests()
    _patch_httpx()


def uninstall() -> None:
    while _originals:
        owner, name, original = _originals.pop()
        setattr(owner, name, original)
