"""Rendering with npx, and what happens when it cannot run."""
import shutil
from pathlib import Path

import pytest

from reporting_labs import render
from reporting_labs.schema import RL_VERSION

ROOT_PACKAGE = Path(__file__).resolve().parents[3] / "package.json"


def test_pinned_version_matches_the_repo():
    import json
    assert RL_VERSION == json.loads(ROOT_PACKAGE.read_text())["version"]


def test_command(monkeypatch, tmp_path):
    monkeypatch.delenv("RL_RENDER_PACKAGE", raising=False)
    assert render.command(tmp_path / ".raw", tmp_path) == ["npx", "-y", f"reporting-labs@{RL_VERSION}", "merge", str(tmp_path / ".raw"), "--out", str(tmp_path)]
    assert render.command(tmp_path / ".raw", tmp_path, "run.html")[-2:] == ["--file", "run.html"]
    monkeypatch.setenv("RL_RENDER_PACKAGE", "reporting-labs@latest")
    assert render.command(tmp_path, tmp_path)[2] == "reporting-labs@latest"


def test_pretty_command_is_relative(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("RL_RENDER_PACKAGE", raising=False)
    assert render.pretty_command(tmp_path / "out dir" / ".raw", tmp_path / "out dir") == f"npx -y reporting-labs@{RL_VERSION} merge 'out dir/.raw' --out 'out dir'"


def test_no_node_keeps_the_data_and_passes(rl_run, pytester, monkeypatch):
    monkeypatch.setenv("PATH", str(pytester.path / "empty-bin"))
    pytester.makepyfile("def test_a(): pass")
    old = pytester.path / "reporting-labs" / "index.html"
    old.parent.mkdir()
    old.write_text("old report")
    run = pytester.runpytest("--rl", "-p", "no:cacheprovider")
    assert run.ret == 0
    run.stdout.fnmatch_lines([
        "reporting-labs: Node.js (npx) was not found, so the HTML was not made.",
        "*The data is saved in reporting-labs/.raw/report.json.",
        f"*npx -y reporting-labs@{RL_VERSION} merge reporting-labs/.raw --out reporting-labs",
    ])
    assert (pytester.path / "reporting-labs" / ".raw" / "report.json").is_file()
    assert not old.exists()  # an older report is never left behind as if it were this run


def test_failed_render_does_not_fail_the_session(pytester, monkeypatch):
    if shutil.which("npx") is None:
        pytest.skip("needs npx")
    monkeypatch.setenv("RL_RENDER_PACKAGE", str(pytester.path / "missing-package.tgz"))
    pytester.makepyfile("def test_a(): pass")
    run = pytester.runpytest("--rl", "-p", "no:cacheprovider")
    assert run.ret == 0
    run.stdout.fnmatch_lines(["reporting-labs: making the HTML failed. The data is saved; run this to try again:", "*missing-package.tgz merge*"])


def test_no_render_prints_the_command(pytester):
    pytester.makepyfile("def test_a(): pass")
    run = pytester.runpytest("--rl", "--rl-no-render", "-p", "no:cacheprovider")
    run.stdout.fnmatch_lines(["reporting-labs: data written to reporting-labs/.raw/report.json (--rl-no-render). To make the HTML run:",
                              "*npx -y reporting-labs@* merge reporting-labs/.raw --out reporting-labs"])


@pytest.fixture
def fake_render(monkeypatch):
    """Pretend npx worked, and record browser opens."""
    opened = []

    def fake(raw_dir, out_dir, out_file="index.html", timeout=300):
        html = out_dir / out_file
        html.write_text("<html></html>")
        return render.RenderResult(True, html, "npx ...")

    monkeypatch.setattr(render, "render", fake)
    monkeypatch.setattr("webbrowser.open", lambda url: opened.append(url))
    monkeypatch.delenv("CI", raising=False)
    return opened


def test_announce_output_file_and_missing_meta(pytester, fake_render):
    (pytester.path / "reporting-labs.config.json").write_text('{"outputFile": "run.html", "open": "never"}')
    pytester.makepyfile("""
        import pytest
        def test_a(): pass
        @pytest.mark.meta(owner="asha")
        def test_b(): pass
    """)
    run = pytester.runpytest("--rl", "-p", "no:cacheprovider")
    run.stdout.fnmatch_lines([
        "reporting-labs: report written to reporting-labs/run.html",
        "reporting-labs: 1 of 2 tests have no meta",
        "*test_announce_output_file_and_missing_meta.py:2  test_a",
    ])
    assert fake_render == []


@pytest.mark.parametrize("mode,fails,ci,expect", [
    (None, True, False, True),        # on-failure (default) and it failed
    (None, False, False, False),      # on-failure and it passed
    ("always", False, False, True),
    ("never", True, False, False),
    ("always", True, True, False),    # never in CI
])
def test_open(pytester, fake_render, monkeypatch, mode, fails, ci, expect):
    if ci:
        monkeypatch.setenv("CI", "true")
    if mode:
        (pytester.path / "reporting-labs.config.json").write_text(f'{{"open": "{mode}", "warnMissingMeta": false}}')
    pytester.makepyfile(f"def test_a(): assert {not fails}")
    pytester.runpytest("--rl", "-p", "no:cacheprovider")
    assert bool(fake_render) is expect
    if expect:
        assert fake_render[0].startswith("file://") and fake_render[0].endswith("/reporting-labs/index.html")
