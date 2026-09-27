import json
from pathlib import Path

import pytest

pytest_plugins = ["pytester"]

BASE_ARGS = ["--rl", "--rl-no-render", "-p", "no:cacheprovider"]


class Run:
    def __init__(self, result, path: Path):
        self.result = result
        self.path = path

    @property
    def report(self):
        return json.loads((self.path / "reporting-labs" / ".raw" / "report.json").read_text())

    def test(self, title):
        found = [t for t in self.report["tests"] if t["title"] == title]
        assert len(found) == 1, [t["title"] for t in self.report["tests"]]
        return found[0]


@pytest.fixture
def rl_run(pytester, monkeypatch):
    """Run pytest with the report on (no HTML) and read .raw/report.json."""
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("PYTEST_XDIST_WORKER", raising=False)

    def run(*args, subprocess=False):
        if subprocess:
            return Run(pytester.runpytest_subprocess(*BASE_ARGS, *args), pytester.path)
        return Run(pytester.runpytest(*BASE_ARGS, *args, no_reraise_ctrlc=True), pytester.path)

    return run
