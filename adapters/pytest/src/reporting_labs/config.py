"""Settings: command line, pytest ini keys and reporting-labs.config.json.

reporting-labs.config.json takes the same keys as ReportingLabsOptions in src/types.ts.
build_options() fills ReportData.options with the same defaults as src/reporter.ts.

Precedence: command line > ini > reporting-labs.config.json > defaults.
Paths from the command line are relative to where pytest was started. Paths from ini
keys are relative to the pytest rootdir. Paths inside the JSON file (outputFolder,
history.file, logo) are relative to the JSON file, like reporter.ts does with its config.
"""
from __future__ import annotations

import base64
import json
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

CONFIG_FILE = "reporting-labs.config.json"
DEFAULT_API_MAX_BODY = 200 * 1024  # same as MAX_BODY in src/auto.ts

DEFAULT_DIMENSIONS = ["priority", "severity", "feature", "owner"]

# Meta keys shown on every test and turned into links, without being breakdown dimensions (reporter.ts META_KEYS).
META_KEYS = ["priority", "severity", "feature", "owner", "epic", "story", "issue", "bug", "component", "module",
             "team", "sprint", "testcase", "tms", "requirement"]

LOGO_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
              ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon"}


class RLWarning(UserWarning):
    pass


@dataclass
class Settings:
    enabled: bool
    options: Dict[str, Any]
    base_dir: Path
    root_dir: Path
    out_dir: Path
    config_file: Optional[Path] = None
    title: str = "Test report"
    render: bool = True
    capture_api: bool = False
    api_max_body: int = DEFAULT_API_MAX_BODY
    project: str = ""

    @property
    def raw_dir(self) -> Path:
        return self.out_dir / ".raw"

    @property
    def out_file(self) -> str:
        return str(self.options.get("outputFile") or "index.html")

    @property
    def history_on(self) -> bool:
        return (self.options.get("history") or {}).get("enabled", True) is not False

    @property
    def history_file(self) -> Path:
        name = (self.options.get("history") or {}).get("file") or "reporting-labs.history.json"
        return (self.base_dir / name).resolve()

    @property
    def history_keep(self) -> int:
        keep = (self.options.get("history") or {}).get("keep")
        return int(keep) if keep is not None else 30


def add_options(parser: pytest.Parser) -> None:
    group = parser.getgroup("reporting-labs", "reportingLabs HTML report")
    group.addoption("--rl", action="store_true", dest="rl", default=False, help="Write a reportingLabs report for this run.")
    group.addoption("--rl-out", dest="rl_out", default=None, metavar="DIR", help="Report folder. Default: reporting-labs")
    group.addoption("--rl-config", dest="rl_config", default=None, metavar="FILE", help=f"Options file. Default: {CONFIG_FILE} in the rootdir, when it exists.")
    group.addoption("--rl-title", dest="rl_title", default=None, help="Report title. Default: \"Test report\"")
    group.addoption("--rl-no-render", dest="rl_no_render", action="store_true", default=False, help="Only write .raw/report.json, do not run npx to make the HTML.")
    group.addoption("--rl-capture-api", dest="rl_capture_api", action="store_true", default=False, help="Record every requests / httpx call in the report.")

    parser.addini("reporting_labs", "Write a reportingLabs report (same as --rl).", type="bool", default=False)
    parser.addini("rl_out", "Report folder, relative to the rootdir.", default="")
    parser.addini("rl_config", f"Options file, relative to the rootdir. Default: {CONFIG_FILE}", default="")
    parser.addini("rl_title", "Report title.", default="")
    parser.addini("rl_no_render", "Only write .raw/report.json (same as --rl-no-render).", type="bool", default=False)
    parser.addini("rl_capture_api", "Record every requests / httpx call (same as --rl-capture-api).", type="bool", default=False)
    parser.addini("rl_api_max_body", f"Largest API body kept, in bytes. Default: {DEFAULT_API_MAX_BODY}", default="")
    parser.addini("rl_project", "Project name shown on every test. Default: empty", default="")


def load_settings(config: pytest.Config) -> Settings:
    root = Path(str(config.rootpath)).resolve()
    cwd = Path(str(config.invocation_params.dir)).resolve()
    enabled = bool(config.getoption("rl") or config.getini("reporting_labs"))

    config_file: Optional[Path] = None
    if config.getoption("rl_config"):
        config_file = (cwd / config.getoption("rl_config")).resolve()
    elif config.getini("rl_config"):
        config_file = (root / config.getini("rl_config")).resolve()
    options: Dict[str, Any] = {}
    if config_file is not None:
        if enabled and not config_file.is_file():
            raise pytest.UsageError(f"reporting-labs: config file not found: {config_file}")
    elif (root / CONFIG_FILE).is_file():
        config_file = root / CONFIG_FILE
    if enabled and config_file is not None and config_file.is_file():
        try:
            options = json.loads(config_file.read_text(encoding="utf-8"))
        except ValueError as e:
            raise pytest.UsageError(f"reporting-labs: {config_file} is not valid JSON: {e}") from None
        if not isinstance(options, dict):
            raise pytest.UsageError(f"reporting-labs: {config_file} must hold a JSON object")
    base = config_file.parent if (config_file is not None and options) else root

    if config.getoption("rl_out"):
        out_dir = (cwd / config.getoption("rl_out")).resolve()
    elif config.getini("rl_out"):
        out_dir = (root / config.getini("rl_out")).resolve()
    else:
        out_dir = (base / (options.get("outputFolder") or "reporting-labs")).resolve()

    title = config.getoption("rl_title") or config.getini("rl_title") or options.get("title") or "Test report"
    max_body = config.getini("rl_api_max_body")
    try:
        api_max_body = int(max_body) if max_body else DEFAULT_API_MAX_BODY
    except ValueError:
        raise pytest.UsageError(f"reporting-labs: rl_api_max_body must be a number of bytes, got {max_body!r}") from None

    return Settings(
        enabled=enabled,
        options=options,
        base_dir=base,
        root_dir=root,
        out_dir=out_dir,
        config_file=config_file if options else None,
        title=str(title),
        render=not (config.getoption("rl_no_render") or config.getini("rl_no_render")),
        capture_api=bool(config.getoption("rl_capture_api") or config.getini("rl_capture_api")),
        api_max_body=api_max_body,
        project=str(config.getini("rl_project") or ""),
    )


def dimensions(options: Dict[str, Any]) -> List[str]:
    return [str(d).lower() for d in (options.get("dimensions") or DEFAULT_DIMENSIONS)]


def meta_keys(options: Dict[str, Any]) -> List[str]:
    """Keys picked up from tags and annotations even when they are not breakdown dimensions (reporter.ts metaKeys)."""
    keys = dimensions(options) + META_KEYS + [str(k).lower() for k in (options.get("links") or {})]
    seen: List[str] = []
    for k in keys:
        if k not in seen and k != "*":
            seen.append(k)
    return seen


def resolve_logo(logo: Optional[str], base: Path) -> Optional[str]:
    """A local image is embedded as a data URI so the report stays one file. URLs and data URIs pass through."""
    if not logo or logo.lower().startswith(("http:", "https:", "data:")):
        return logo
    file = (base / logo).resolve()
    if not file.is_file():
        warnings.warn(RLWarning(f"reporting-labs: logo not found at {file}"), stacklevel=2)
        return None
    mime = LOGO_TYPES.get(file.suffix.lower())
    if not mime:
        warnings.warn(RLWarning(f"reporting-labs: logo {logo} is not a png, jpg, svg, gif or webp file"), stacklevel=2)
        return None
    return f"data:{mime};base64,{base64.b64encode(file.read_bytes()).decode('ascii')}"


WIDGETS = ["runStrip", "outcome", "attention", "dimensions", "timeline", "durations", "tags", "slowest", "projects",
           "flaky", "environment", "skipped"]


def build_options(options: Dict[str, Any], base: Path, env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """ReportData.options, built field by field like src/reporter.ts."""
    env = os.environ if env is None else env
    widgets = options.get("widgets") or {}
    out: Dict[str, Any] = {
        "logo": resolve_logo(options.get("logo"), base),
        "accent": options.get("accent"),
        "theme": options.get("theme") or "auto",
        "palette": options.get("palette") or "lab",
        "embedFonts": options.get("embedFonts", True) is not False,
        "sections": options.get("sections") or [],
        "widgets": {w: widgets.get(w, True) is not False for w in WIDGETS},
        "dimensions": dimensions(options),
        "dimensionOrder": {
            "priority": ["P0", "P1", "P2", "P3", "P4"],
            "severity": ["blocker", "critical", "major", "high", "medium", "normal", "minor", "low", "trivial"],
            **(options.get("dimensionOrder") or {}),
        },
        "project": options.get("project"),
        "links": options.get("links") or {},
        "customCss": options.get("customCss") or "",
        "editorLinks": options["editorLinks"] if options.get("editorLinks") is not None else not env.get("CI"),
    }
    # JSON.stringify drops undefined; do the same so the shape matches src/types.ts.
    return {k: v for k, v in out.items() if v is not None}
