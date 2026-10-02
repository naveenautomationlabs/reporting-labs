"""Rolling run history, the same file and shape as src/reporter.ts.

File: reporting-labs.history.json next to the config (history.file to change it).
Each entry is a HistoryEntry. `tests` maps TestData.key to [code, last-attempt duration]
with codes p passed, f failed (also timedOut and interrupted), k flaky, s skipped.
The last entry is the current run; the template compares it with the ones before.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional


def load(file: Path) -> List[Dict[str, Any]]:
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []  # first run, or a broken file
    return data if isinstance(data, list) else []


def code(outcome: str) -> str:
    return {"passed": "p", "flaky": "k", "skipped": "s"}.get(outcome, "f")


def entry(start_ms: float, duration_ms: float, stats: Mapping[str, int], tests: List[Mapping[str, Any]],
          label: Optional[str]) -> Dict[str, Any]:
    per_test: Dict[str, List[Any]] = {}
    for t in tests:
        last = t["results"][-1] if t["results"] else None
        per_test[t["key"]] = [code(t["outcome"]), round(last["duration"] if last else t["duration"])]
    current: Dict[str, Any] = {
        "time": start_ms,
        "duration": duration_ms,
        "passed": stats["passed"],
        "failed": stats["failed"] + stats["timedOut"] + stats["interrupted"],
        "flaky": stats["flaky"],
        "skipped": stats["skipped"],
        "total": stats["total"],
    }
    if label is not None:
        current["label"] = label
    current["tests"] = per_test
    return current


def label_for(options: Mapping[str, Any], ci_label: Optional[str]) -> Optional[str]:
    """metadata.build, else the CI run number, else metadata.branch (reporter.ts uses ?? for each step)."""
    meta = options.get("metadata") or {}
    if meta.get("build") is not None:
        return str(meta["build"])
    if ci_label is not None:
        return ci_label
    if meta.get("branch") is not None:
        return str(meta["branch"])
    return None


def roll(entries: List[Dict[str, Any]], current: Dict[str, Any], keep: int = 30) -> List[Dict[str, Any]]:
    history = entries + [current]
    return history[-keep:] if keep > 0 else history


def save(file: Path, history: List[Dict[str, Any]]) -> None:
    try:
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(history, indent=1, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # read-only file system: the report still has this run's history
