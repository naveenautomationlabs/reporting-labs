"""Helpers for tests that need Node and the tools/ project (npm ci --prefix tools)."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[1] / "tools"


def need_tools() -> None:
    """Skip when Node or tools/node_modules is missing. RL_REQUIRE_NODE=1 makes that a failure."""
    missing = None
    if shutil.which("node") is None:
        missing = "node is not installed"
    elif not (TOOLS / "node_modules" / "typescript").is_dir():
        missing = "run `npm ci --prefix tools` first"
    if missing:
        if os.environ.get("RL_REQUIRE_NODE"):
            pytest.fail(missing)
        pytest.skip(missing)


def node(script: str, *args: str, stdin=None, check=True) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(TOOLS / script), *args], input=None if stdin is None else json.dumps(stdin),
                          capture_output=True, text=True, timeout=300, check=check)
