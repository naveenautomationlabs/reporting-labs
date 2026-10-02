"""Makes index.html from .raw/report.json with the reporting-labs npm package.

It runs the existing merge command, pinned to the version this adapter was built for:

    npx -y reporting-labs@0.6.1 merge <out>/.raw --out <out>

Set RL_RENDER_PACKAGE to use another version or a local tarball, for example
RL_RENDER_PACKAGE=reporting-labs@latest or RL_RENDER_PACKAGE=/path/reporting-labs-0.7.0.tgz.

If Node is missing or the command fails, report.json stays in place, the command is
printed so you can run it by hand, and the test session is not failed.
"""
from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from .schema import RL_VERSION


@dataclass
class RenderResult:
    ok: bool
    html: Optional[Path]
    command: str
    lines: List[str] = field(default_factory=list)


def package_spec() -> str:
    return os.environ.get("RL_RENDER_PACKAGE") or f"reporting-labs@{RL_VERSION}"


def command(raw_dir: Path, out_dir: Path, out_file: str = "index.html") -> List[str]:
    cmd = ["npx", "-y", package_spec(), "merge", str(raw_dir), "--out", str(out_dir)]
    if out_file != "index.html":
        cmd += ["--file", out_file]
    return cmd


def pretty_command(raw_dir: Path, out_dir: Path, out_file: str = "index.html") -> str:
    """The command to run by hand, with paths relative to the current folder."""
    return _pretty(command(raw_dir, out_dir, out_file))


def _pretty(cmd: List[str]) -> str:
    cwd = Path.cwd()
    shown = []
    for part in cmd:
        p = Path(part)
        if p.is_absolute():
            try:
                part = os.path.relpath(p, cwd)
            except ValueError:  # another drive on Windows
                pass
        shown.append(shlex.quote(part))
    return " ".join(shown)


def render(raw_dir: Path, out_dir: Path, out_file: str = "index.html", timeout: float = 300) -> RenderResult:
    cmd = command(raw_dir, out_dir, out_file)
    pretty = _pretty(cmd)
    html = out_dir / out_file
    if html.exists():
        html.unlink()  # never leave an older report behind if this render fails
    npx = shutil.which("npx")
    if npx is None:
        return RenderResult(False, None, pretty, [
            "reporting-labs: Node.js (npx) was not found, so the HTML was not made.",
            f"  The data is saved in {os.path.relpath(raw_dir / 'report.json')}.",
            "  Install Node 18+ and run:",
            f"    {pretty}",
        ])
    cmd = command(raw_dir.resolve(), out_dir.resolve(), out_file)  # absolute: npx runs from another folder
    try:
        # Run npx from an empty folder: inside a project whose package.json is itself named
        # "reporting-labs" (this repository), npx would try that local copy and fail.
        with tempfile.TemporaryDirectory(prefix="rl-render-") as neutral:
            proc = subprocess.run([npx] + cmd[1:], cwd=neutral, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  timeout=timeout, check=False)
        output = proc.stdout.decode("utf-8", "replace").strip()
        ok = proc.returncode == 0 and html.is_file()
    except (OSError, subprocess.SubprocessError) as e:
        output, ok = str(e), False
    if ok:
        return RenderResult(True, html, pretty)
    tail = [f"    {line}" for line in output.splitlines()[-8:]]
    return RenderResult(False, None, pretty, [
        "reporting-labs: making the HTML failed. The data is saved; run this to try again:",
        f"    {pretty}",
        "  Output:",
        *tail,
    ])
