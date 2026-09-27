"""Turns pytest reports into ReportData (see src/types.ts).

item_info() runs where the test runs (the worker under pytest-xdist). Collector runs in
the main process only: it receives every TestReport, with or without xdist, and builds
the report at the end. The outcome rules mirror outcome() in src/reporter.ts.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import pytest

from . import config as rlconfig
from . import environment, history
from .explain import explain_error
from .masking import Masker, parse_csv

ANSI = re.compile(r"\x1b\[[0-9;]*m")

# Markers that are pytest or plugin plumbing, not labels worth showing as tags.
NOT_TAGS = {"parametrize", "skip", "skipif", "xfail", "usefixtures", "filterwarnings", "flaky", "timeout", "meta",
            "asyncio", "anyio", "trio", "tryfirst", "trylast"}

STATUSES = ["passed", "failed", "skipped", "flaky", "timedOut", "interrupted"]


def strip_ansi(s: str) -> str:
    return ANSI.sub("", s)


def worker_index() -> int:
    m = re.match(r"gw(\d+)$", os.environ.get("PYTEST_XDIST_WORKER", ""))
    return int(m.group(1)) if m else 0


# ── static facts about a test item (runs on the worker) ────────────────────

def item_info(item: pytest.Item, meta_keys: Sequence[str]) -> Dict[str, Any]:
    file, lineno, _ = item.location
    tags: List[str] = []
    for mark in reversed(list(item.iter_markers())):  # outermost first, like describe-level tags
        if mark.name in NOT_TAGS:
            continue
        if mark.name.lower() in meta_keys and len(mark.args) == 1 and not mark.kwargs and isinstance(mark.args[0], (str, int)):
            tag = f"@{mark.name}:{mark.args[0]}"
        else:
            tag = f"@{mark.name}"
        if tag not in tags:
            tags.append(tag)

    meta: Dict[str, str] = {}
    for mark in reversed(list(item.iter_markers("meta"))):  # closest marker wins
        for arg in mark.args:
            if isinstance(arg, dict):
                meta.update({str(k).lower(): str(v) for k, v in arg.items() if v is not None})
        meta.update({k.lower(): str(v) for k, v in mark.kwargs.items() if v is not None})

    info: Dict[str, Any] = {
        "file": str(file).replace(os.sep, "/"),
        "line": (lineno or 0) + 1,
        "title": item.name,
        "path": [n.name for n in item.listchain() if isinstance(n, pytest.Class)],
        "tags": tags,
        "annotations": [{"type": k, "description": v} for k, v in meta.items()],
    }
    timeout = _timeout_seconds(item)
    if timeout:
        info["timeout"] = round(timeout * 1000)
    retries = _reruns(item)
    if retries:
        info["retries"] = retries
    return info


def _timeout_seconds(item: pytest.Item) -> Optional[float]:
    mark = item.get_closest_marker("timeout")
    try:
        if mark is not None:
            value = mark.args[0] if mark.args else mark.kwargs.get("timeout")
            return float(value) if value is not None else None
        value = item.config.getoption("timeout", default=None)
        return float(value) if value else None
    except (TypeError, ValueError):
        return None


def _reruns(item: pytest.Item) -> int:
    try:
        from pytest_rerunfailures import get_reruns_count  # type: ignore
    except ImportError:
        return 0
    try:
        return int(get_reruns_count(item) or 0)
    except Exception:
        return 0


def info_from_nodeid(nodeid: str) -> Dict[str, Any]:
    """Best effort for a test that never reached a worker (xdist, run stopped early)."""
    parts = nodeid.split("::")
    return {"file": parts[0], "line": 0, "title": parts[-1], "path": [p for p in parts[1:-1] if not p.startswith("(")],
            "tags": [], "annotations": []}


# ── errors ──────────────────────────────────────────────────────────────────

def _longrepr_text(longrepr: Any) -> str:
    if longrepr is None:
        return ""
    if isinstance(longrepr, tuple) and len(longrepr) == 3:
        return str(longrepr[2])
    return strip_ansi(str(longrepr))


def _message_from_text(text: str) -> str:
    lines = [line[1:].strip() for line in text.split("\n") if line.startswith("E ")]
    if lines:
        return "\n".join(lines)
    rest = [line for line in text.split("\n") if line.strip()]
    return rest[-1].strip() if rest else text


class ErrorReader:
    """Reads ErrorData out of a pytest longrepr, with paths relative to the rootdir."""

    def __init__(self, root: Path, cwd: Path) -> None:
        self.root = root
        self.cwd = cwd

    def rel(self, path: str) -> Optional[str]:
        p = Path(path)
        candidates = [p] if p.is_absolute() else [self.cwd / p, self.root / p]
        for c in candidates:
            try:
                c = c.resolve()
            except OSError:
                continue
            if c.exists():
                try:
                    return c.relative_to(self.root).as_posix()
                except ValueError:
                    return c.as_posix()
        return None

    def location(self, longrepr: Any, test_file: str) -> Optional[Dict[str, Any]]:
        tb = getattr(longrepr, "reprtraceback", None)
        chain = getattr(longrepr, "chain", None)
        if chain:
            tb = chain[-1][0]
        found = None
        for entry in getattr(tb, "reprentries", None) or []:
            loc = getattr(entry, "reprfileloc", None)
            if loc is None:
                continue
            rel = self.rel(loc.path)
            if rel == test_file:
                found = {"file": rel, "line": int(loc.lineno), "column": 0}
        if found:
            return found
        crash = getattr(longrepr, "reprcrash", None)
        if crash is not None:
            rel = self.rel(crash.path)
            if rel:
                return {"file": rel, "line": int(crash.lineno), "column": 0}
        return None

    def read(self, longrepr: Any, test_file: str = "") -> Dict[str, Any]:
        text = _longrepr_text(longrepr)
        crash = getattr(longrepr, "reprcrash", None)
        message = strip_ansi(crash.message) if crash is not None and getattr(crash, "message", None) else _message_from_text(text)
        error: Dict[str, Any] = {"message": message}
        if text and text != message:
            error["stack"] = text
        loc = self.location(longrepr, test_file)
        if loc:
            error["location"] = loc
        return error


# ── accumulated reports ─────────────────────────────────────────────────────

class Phase:
    def __init__(self, report: pytest.TestReport, errors: ErrorReader, test_file: str) -> None:
        self.when = report.when
        self.outcome = report.outcome  # passed, failed, skipped, or "rerun" from pytest-rerunfailures
        self.duration = float(getattr(report, "duration", 0) or 0) * 1000
        wasxfail = getattr(report, "wasxfail", None)
        self.wasxfail: Optional[str] = None if wasxfail is None else re.sub(r"^reason:\s*", "", str(wasxfail))
        self.skip_reason: Optional[str] = None
        self.error: Optional[Dict[str, Any]] = None
        self.strict_xpass: Optional[str] = None
        longrepr = report.longrepr
        if isinstance(longrepr, str) and longrepr.startswith("[XPASS(strict)]"):
            self.strict_xpass = longrepr[len("[XPASS(strict)]"):].strip()
        elif self.outcome in ("failed", "rerun") or (self.outcome == "skipped" and self.wasxfail is not None and longrepr is not None and not isinstance(longrepr, tuple)):
            self.error = errors.read(longrepr, test_file)
        elif self.outcome == "skipped" and isinstance(longrepr, tuple):
            self.skip_reason = re.sub(r"^Skipped:\s*", "", str(longrepr[2]))
        self.stdout = self._section(report, "stdout")
        self.stderr = self._section(report, "stderr")

    def _section(self, report: pytest.TestReport, key: str) -> Optional[str]:
        # item._report_sections keeps growing across phases and reruns: take the newest one for this phase.
        want = f"Captured {key} {self.when}"
        found = None
        for title, content in getattr(report, "sections", []) or []:
            if title == want:
                found = content
        return found

    @property
    def timed_out(self) -> bool:
        return bool(self.error and re.match(r"Failed: Timeout \(?>", self.error["message"]))


class AttemptAcc:
    def __init__(self) -> None:
        self.phases: Dict[str, Phase] = {}
        self.payload: Dict[str, Any] = {}

    @property
    def xfailed(self) -> bool:
        return any(p.wasxfail is not None and p.outcome == "skipped" for p in self.phases.values())

    @property
    def xpassed(self) -> bool:
        call = self.phases.get("call")
        return bool(call and ((call.wasxfail is not None and call.outcome == "passed") or call.strict_xpass is not None))

    @property
    def xfail_reason(self) -> Optional[str]:
        for p in self.phases.values():
            if p.wasxfail is not None:
                return p.wasxfail
            if p.strict_xpass is not None:
                return p.strict_xpass
        return None

    def status(self, interrupted: bool) -> str:
        """The status of one attempt, with Playwright's names."""
        phases = list(self.phases.values())
        if any(p.timed_out for p in phases):
            return "timedOut"
        if self.xpassed:
            return "passed"
        if any(p.outcome in ("failed", "rerun") for p in phases):
            return "failed"
        if self.xfailed:
            return "failed" if "call" in self.phases else "skipped"  # xfail(run=False) never runs
        if any(p.outcome == "skipped" for p in phases):
            return "skipped"
        if "teardown" not in self.phases and "call" not in self.phases:
            return "interrupted" if interrupted else "failed"
        if "teardown" not in self.phases and interrupted:
            return "interrupted"
        return "passed"


class TestAcc:
    __test__ = False

    def __init__(self, nodeid: str) -> None:
        self.nodeid = nodeid
        self.info: Optional[Dict[str, Any]] = None
        self.attempts: List[AttemptAcc] = []


# ── the collector ───────────────────────────────────────────────────────────

class Collector:
    def __init__(self, settings: rlconfig.Settings, cwd: Path) -> None:
        self.settings = settings
        self.errors = ErrorReader(settings.root_dir, cwd)
        self.tests: Dict[str, TestAcc] = {}
        self.global_errors: List[Dict[str, Any]] = []
        self._global_seen: set = set()
        self.start = time.time() * 1000
        self.workers = 0
        self.keyboard_interrupt = False
        self.stop_reason: Optional[str] = None

    def _acc(self, nodeid: str) -> TestAcc:
        if nodeid not in self.tests:
            self.tests[nodeid] = TestAcc(nodeid)
        return self.tests[nodeid]

    def add_collected(self, nodeid: str, info: Optional[Dict[str, Any]] = None) -> None:
        acc = self._acc(nodeid)
        if info and acc.info is None:
            acc.info = info

    def add_report(self, report: pytest.TestReport) -> None:
        acc = self._acc(report.nodeid)
        payload = getattr(report, "rl_payload", None) or {}
        if payload.get("info"):
            acc.info = payload["info"]
        test_file = (acc.info or info_from_nodeid(report.nodeid))["file"]
        if report.when == "setup" or not acc.attempts or report.when in acc.attempts[-1].phases:
            acc.attempts.append(AttemptAcc())
        attempt = acc.attempts[-1]
        attempt.phases[report.when] = Phase(report, self.errors, test_file)
        if payload:
            attempt.payload = payload

    def add_global_error(self, error: Dict[str, Any]) -> None:
        sig = (error.get("message"), (error.get("location") or {}).get("file"))
        if sig in self._global_seen:  # every xdist worker reports the same collection error
            return
        self._global_seen.add(sig)
        self.global_errors.append(error)

    def add_collect_error(self, report: pytest.CollectReport) -> None:
        text = _longrepr_text(report.longrepr)
        error: Dict[str, Any] = {"message": _message_from_text(text)}
        if text != error["message"]:
            error["stack"] = text
        file = report.nodeid.split("::")[0] if report.nodeid else ""
        if file:
            m = re.search(rf"^{re.escape(file)}:(\d+):", text, re.M)
            error["location"] = {"file": file, "line": int(m.group(1)) if m else 1, "column": 0}
        self.add_global_error(error)

    # ── build ───────────────────────────────────────────────────────────────

    def build(self, exitstatus: int, env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        env = dict(os.environ) if env is None else env
        s = self.settings
        options = s.options
        masker = Masker(options.get("maskKeys") or [])
        keys = rlconfig.meta_keys(options)
        interrupted = self.keyboard_interrupt
        end = time.time() * 1000

        tests: List[Dict[str, Any]] = []
        workers = 0
        for nodeid, acc in self.tests.items():
            info = acc.info or info_from_nodeid(nodeid)
            results = []
            for i, att in enumerate(acc.attempts):
                r = self._result(att, i, masker, interrupted)
                workers = max(workers, r["workerIndex"] + 1)
                results.append(r)
            last_payload = acc.attempts[-1].payload if acc.attempts else {}
            annotations = list(info.get("annotations") or [])
            for a in last_payload.get("annotations") or []:
                if not any(b.get("type") == a.get("type") and b.get("description") == a.get("description") for b in annotations):
                    annotations.append(a)
            t = self._outcome(acc, results, interrupted)
            skip_reason = t.pop("skipReason", None)
            if skip_reason is not None:
                annotations.append({"type": "skip", "description": skip_reason} if skip_reason else {"type": "skip"})
            xfail = next((a.xfail_reason for a in reversed(acc.attempts) if a.xfail_reason is not None), None)
            if xfail is not None:
                annotations.append({"type": "fail", "description": xfail} if xfail else {"type": "fail"})
            key = f"{s.project}::{nodeid}"
            test: Dict[str, Any] = {
                "id": hashlib.sha1(key.encode("utf-8")).hexdigest()[:20],
                "key": key,
                "title": info["title"],
                "path": info["path"],
                "file": info["file"],
                "line": info["line"],
                "project": s.project,
                "tags": info["tags"],
                "annotations": annotations,
                "meta": extract_meta(info["tags"], annotations, keys),
                "outcome": t["outcome"],
                "duration": round(sum(r["duration"] for r in results), 3),
                "results": results,
                "expectedStatus": t["expectedStatus"],
            }
            if t.get("expectedFailure"):
                test["expectedFailure"] = True
            if t.get("note"):
                test["note"] = t["note"]
            if info.get("timeout"):
                test["timeout"] = info["timeout"]
            if info.get("retries"):
                test["retries"] = info["retries"]
            tests.append(test)

        stats = {k: 0 for k in STATUSES}
        for t in tests:
            stats[t["outcome"]] += 1
        stats["total"] = len(tests)
        failed = stats["failed"] + stats["timedOut"] + stats["interrupted"]
        if interrupted:
            run_status = "interrupted"
        elif failed or self.global_errors or exitstatus in (1, 3):
            run_status = "failed"
        else:
            run_status = "passed"

        workers = max(workers, self.workers)
        duration = round(end - self.start, 3)
        hist: List[Dict[str, Any]] = []
        if s.history_on:
            entries = history.load(s.history_file)
            label = history.label_for(options, environment.ci_run_label(env))
            hist = history.roll(entries, history.entry(round(self.start, 3), duration, stats, tests, label), s.history_keep)
            history.save(s.history_file, hist)
        bdd = options.get("bdd")
        if bdd is None:
            bdd = any(re.match(r"^(Given|When|Then|And|But)\b", st["title"]) for t in tests for r in t["results"] for st in r["steps"])

        return {
            "title": s.title,
            "generatedAt": round(end, 3),
            "startTime": round(self.start, 3),
            "duration": duration,
            "metadata": {str(k): str(v) for k, v in (options.get("metadata") or {}).items()},
            "projects": [s.project],
            "workers": workers,
            "stats": stats,
            "tests": tests,
            "history": hist,
            "bdd": bool(bdd),
            "rootDir": str(s.root_dir),
            "env": environment.collect_env(s.base_dir, options, env, workers),
            "runStatus": run_status,
            "globalErrors": [self._mask_error(e, masker) for e in self.global_errors],
            "globalOutput": [],
            "options": rlconfig.build_options(options, s.base_dir, env),
        }

    def _outcome(self, acc: TestAcc, results: List[Dict[str, Any]], interrupted: bool) -> Dict[str, Any]:
        xfail_marked = any(a.xfail_reason is not None for a in acc.attempts)
        if not acc.attempts:
            if interrupted:
                return {"outcome": "interrupted", "expectedStatus": "passed", "note": "This test never ran: the run was interrupted before it started."}
            reason = f"Not run: {self.stop_reason}" if self.stop_reason else "Not run: the run stopped before this test."
            return {"outcome": "skipped", "expectedStatus": "skipped", "skipReason": reason}
        last = acc.attempts[-1]
        status = results[-1]["status"]
        expected = "failed" if xfail_marked else "passed"
        if last.xfailed and status != "skipped":
            return {"outcome": "passed", "expectedStatus": "failed", "expectedFailure": True,
                    "note": "Failed as expected: this test is marked xfail. The failure below is the known one."}
        if last.xpassed:
            return {"outcome": "failed", "expectedStatus": "failed",
                    "note": "Passed, but the test is marked xfail. If the bug is fixed, remove the marker."}
        if status == "skipped":
            skip = next((p.skip_reason for p in last.phases.values() if p.skip_reason is not None), None)
            out: Dict[str, Any] = {"outcome": "skipped", "expectedStatus": "skipped"}
            if skip is not None:
                out["skipReason"] = skip
            return out
        if status == "timedOut":
            ms = next((e.get("explain", {}).get("timeoutMs") for e in results[-1]["errors"] if e.get("explain", {}).get("timeoutMs")), None)
            return {"outcome": "timedOut", "expectedStatus": expected, "note": f"Exceeded the {_secs(ms)} timeout." if ms else "Exceeded the timeout."}
        if status == "interrupted":
            return {"outcome": "interrupted", "expectedStatus": expected, "note": "The run was interrupted while this test was executing."}
        if status == "passed":
            if any(r["status"] in ("failed", "timedOut") for r in results[:-1]):
                return {"outcome": "flaky", "expectedStatus": expected}
            return {"outcome": "passed", "expectedStatus": expected}
        return {"outcome": "failed", "expectedStatus": expected}

    def _result(self, att: AttemptAcc, retry: int, masker: Masker, interrupted: bool) -> Dict[str, Any]:
        p = att.payload
        errors = []
        stdout: List[str] = []
        stderr: List[str] = []
        for phase in ("setup", "call", "teardown"):
            ph = att.phases.get(phase)
            if ph is None:
                continue
            if ph.error:
                errors.append(self._mask_error(ph.error, masker))
            if ph.stdout:
                stdout.append(masker.mask_str(strip_ansi(ph.stdout)))
            if ph.stderr:
                stderr.append(masker.mask_str(strip_ansi(ph.stderr)))
        for when, ph in att.phases.items():  # xdist crash reports use when="???"
            if when not in ("setup", "call", "teardown") and ph.error:
                errors.append(self._mask_error(ph.error, masker))
        logs = sorted(({"t": entry["t"], "msg": masker.mask_str(str(entry["msg"]))} for entry in p.get("logs") or []), key=lambda entry: entry["t"])
        return {
            "retry": retry,
            "status": att.status(interrupted),
            "duration": round(sum(ph.duration for ph in att.phases.values()), 3),
            "startTime": p.get("start") or round(self.start, 3),
            "workerIndex": int(p.get("worker") or 0),
            "errors": errors,
            "steps": [_mask_step(st, masker) for st in p.get("steps") or []],
            "attachments": [],
            "stdout": stdout,
            "stderr": stderr,
            "logs": logs,
            "data": [to_data_block(d, masker) for d in p.get("data") or []],
            "api": [masker.mask(c) for c in p.get("api") or []],
        }

    @staticmethod
    def _mask_error(error: Dict[str, Any], masker: Masker) -> Dict[str, Any]:
        out = dict(error)
        out["message"] = masker.mask_str(strip_ansi(out.get("message") or ""))
        if out.get("stack"):
            out["stack"] = masker.mask_str(out["stack"])
        why = explain_error(out["message"])
        if why:
            out["explain"] = why
        return out


def _secs(ms: float) -> str:
    return f"{ms / 1000:.{1 if ms % 1000 else 0}f}s" if ms >= 1000 else f"{ms:g}ms"


def _mask_step(step: Dict[str, Any], masker: Masker) -> Dict[str, Any]:
    out = {"title": step["title"], "category": step.get("category", "test.step"), "duration": step.get("duration", 0),
           "steps": [_mask_step(c, masker) for c in step.get("steps") or []]}
    if step.get("error"):
        out["error"] = masker.mask_str(strip_ansi(step["error"]))
    return out


def extract_meta(tags: Sequence[str], annotations: Sequence[Dict[str, str]], keys: Sequence[str]) -> Dict[str, str]:
    """Port of extractMeta in src/reporter.ts: tags first, annotations last so a test can override."""
    meta: Dict[str, str] = {}
    for raw in tags:
        tag = re.sub(r"^@", "", raw)
        m = re.match(r"^([a-z_-]+)[:=](.+)$", tag, re.I)
        if m and m.group(1).lower() in keys:
            meta[m.group(1).lower()] = m.group(2)
            continue
        if re.match(r"^P[0-4]$", tag, re.I) and "priority" in keys and not meta.get("priority"):
            meta["priority"] = tag.upper()
        if re.match(r"^(blocker|critical|major|minor|trivial)$", tag, re.I) and "severity" in keys and not meta.get("severity"):
            meta["severity"] = tag.lower()
    for a in annotations:
        k = str(a.get("type", "")).lower()
        if k in keys and a.get("description"):
            meta[k] = a["description"]
    return meta


def _js_string(v: Any) -> str:
    """String(v) / JSON.stringify(v) as reporter.ts fmt() does."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return str(v)


def to_data_block(entry: Dict[str, Any], masker: Masker) -> Dict[str, Any]:
    """Port of toDataBlock in src/reporter.ts."""
    name, kind, v = entry.get("name", "Test data"), entry.get("kind"), entry.get("value")
    if kind == "text":
        return {"name": name, "kind": "text", "text": masker.mask_str(str(v))}
    if kind == "csv":
        columns, rows = parse_csv(str(v))
        masked = [[("****" if masker.is_sensitive(columns[i] if i < len(columns) else "") else masker.mask_str(c)) for i, c in enumerate(r)] for r in rows]
        return {"name": name, "kind": "table", "columns": columns, "rows": masked}
    v = masker.mask(v)
    if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
        columns: List[str] = []
        for x in v:
            for k in x:
                if k not in columns:
                    columns.append(k)
        return {"name": name, "kind": "table", "columns": columns, "rows": [[_js_string(x.get(c)) for c in columns] for x in v]}
    if isinstance(v, dict):
        return {"name": name, "kind": "kv", "kv": [[k, _js_string(x)] for k, x in v.items()]}
    return {"name": name, "kind": "text", "text": json.dumps(v, indent=2, ensure_ascii=False)}
