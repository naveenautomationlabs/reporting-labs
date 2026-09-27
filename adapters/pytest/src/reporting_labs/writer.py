"""Writes <out>/.raw/report.json, the input for `npx reporting-labs merge`."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict


def write_raw(data: Dict[str, Any], raw_dir: Path) -> Path:
    shutil.rmtree(raw_dir, ignore_errors=True)  # no stale assets from an earlier run
    raw_dir.mkdir(parents=True, exist_ok=True)
    file = raw_dir / "report.json"
    file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")
    return file
