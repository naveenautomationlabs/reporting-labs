"""End to end: run the examples twice, render with `npx reporting-labs merge`, and open the HTML."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from nodetools import need_tools, node

pytestmark = pytest.mark.e2e

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def test_examples_twice_render_and_keep_history(tmp_path):
    need_tools()
    if shutil.which("npx") is None:
        pytest.skip("needs npx")
    pytest.importorskip("requests")
    work = tmp_path / "examples"
    shutil.copytree(EXAMPLES, work, ignore=shutil.ignore_patterns("reporting-labs", "reporting-labs.history.json", "__pycache__"))
    env = {**os.environ, "CI": "true"}  # CI: never open a browser
    env.pop("RL_LIVE", None)

    runs = []
    for _ in range(2):
        proc = subprocess.run([sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "-q"], cwd=work, env=env,
                              capture_output=True, text=True, timeout=600)
        runs.append(proc)
        assert proc.returncode == 1, proc.stdout[-3000:] + proc.stderr[-3000:]  # some examples fail on purpose
        assert "reporting-labs: report written to reporting-labs/index.html" in proc.stdout, proc.stdout[-3000:]

    out = work / "reporting-labs"
    html = out / "index.html"
    assert html.is_file() and html.stat().st_size > 50_000
    merged = json.loads((out / "report.json").read_text())
    assert len(merged["history"]) == 2
    first, second = merged["history"]
    assert set(first["tests"]) == set(second["tests"]) and len(second["tests"]) == merged["stats"]["total"]
    assert merged["title"] == "Shop API tests"
    try:
        import pytest_rerunfailures  # noqa: F401
        assert merged["stats"]["flaky"] == 1
    except ImportError:
        pass
    assert json.loads((work / "reporting-labs.history.json").read_text()) == merged["history"]

    checked = json.loads(node("html-check.js", str(html)).stdout)
    assert checked["errors"] == [] and checked["history"] == 2 and checked["title"] is True
    result = node("check-report.js", str(out / ".raw" / "report.json"), check=False)
    assert result.returncode == 0, result.stdout + result.stderr


def test_renders_inside_a_project_named_reporting_labs(pytester):
    # npx must not pick up a local package.json named "reporting-labs" (like this repository's root).
    if shutil.which("npx") is None:
        pytest.skip("needs npx")
    (pytester.path / "package.json").write_text('{"name": "reporting-labs", "version": "0.6.1"}')
    pytester.makepyfile("def test_a(): pass")
    result = pytester.runpytest("--rl", "-p", "no:cacheprovider")
    assert result.ret == 0
    result.stdout.fnmatch_lines(["reporting-labs: report written to reporting-labs/index.html"])
    assert (pytester.path / "reporting-labs" / "index.html").is_file()
