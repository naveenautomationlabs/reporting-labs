"""The test attempt that is running right now.

A new Attempt starts when a test's setup starts, and ends after its teardown report.
Logs, test data, meta, steps and API calls land on the current Attempt.

Lookup order: a contextvar (follows asyncio tasks), then a process-wide fallback so
calls from plain threads started by the test are kept too. Outside a test there is
no Attempt, and the helpers do nothing.

What that means for fixtures: a session or module scoped fixture runs its setup inside
the setup of the first test that needs it, and its teardown inside the teardown of the
last test. Calls it makes are recorded on those tests.
"""
from __future__ import annotations

import json
import time
from contextvars import ContextVar
from typing import Any, Dict, List, Optional


def now_ms() -> float:
    return round(time.time() * 1000, 3)


def jsonable(value: Any) -> Any:
    """What JSON.stringify would keep: tuples become lists, unknown objects become str()."""
    try:
        return json.loads(json.dumps(value, default=str, ensure_ascii=False))
    except (TypeError, ValueError):
        return str(value)


class Attempt:
    def __init__(self, nodeid: str) -> None:
        self.nodeid = nodeid
        self.start = now_ms()
        self.logs: List[Dict[str, Any]] = []
        self.data: List[Dict[str, Any]] = []
        self.api: List[Dict[str, Any]] = []
        self.annotations: List[Dict[str, str]] = []
        self.steps: List[Dict[str, Any]] = []
        self.open_steps: List[Dict[str, Any]] = []

    def snapshot(self) -> Dict[str, Any]:
        """Plain JSON data. pytest-xdist sends it from the worker to the controller with the report."""
        return jsonable({
            "start": self.start,
            "logs": self.logs,
            "data": self.data,
            "api": self.api,
            "annotations": self.annotations,
            "steps": self.steps,
        })


_current: ContextVar[Optional[Attempt]] = ContextVar("reporting_labs_attempt", default=None)
_fallback: Optional[Attempt] = None


def current() -> Optional[Attempt]:
    return _current.get() or _fallback


def activate(attempt: Attempt) -> None:
    global _fallback
    _fallback = attempt
    _current.set(attempt)


def deactivate() -> None:
    global _fallback
    _fallback = None
    _current.set(None)
