"""pytest hooks for reportingLabs.

Installed through the `pytest11` entry point. It does nothing until you pass --rl or set
`reporting_labs = true` in your pytest ini, so installing it never changes other runs.
"""
from __future__ import annotations

import os
import time
import webbrowser
from pathlib import Path
from typing import Any, List, Optional

import pytest

from . import api_capture, context, render, writer
from . import config as rlconfig
from .collector import Collector, item_info, worker_index
from .xdist_support import is_worker
from .xdist_support import register as register_xdist


def pytest_addoption(parser: pytest.Parser) -> None:
    rlconfig.add_options(parser)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "meta(**values): report metadata, e.g. meta(priority='P1', severity='critical', owner='asha', feature='checkout', "
        "epic=..., story=..., issue=..., component=..., team=...). Any other key is kept too.",
    )
    settings = rlconfig.load_settings(config)
    if not settings.enabled:
        return
    config.pluginmanager.register(Runtime(settings), "reporting_labs_runtime")
    if settings.capture_api:
        api_capture.install(settings.api_max_body)
    if not is_worker(config):
        collector = Collector(settings, Path(str(config.invocation_params.dir)))
        config.pluginmanager.register(Controller(config, settings, collector), "reporting_labs_controller")
        register_xdist(config, collector)


def pytest_unconfigure(config: pytest.Config) -> None:
    api_capture.uninstall()
    context.deactivate()


class Runtime:
    """Runs where the tests run. Starts an Attempt per try of a test and puts its data on each report."""

    def __init__(self, settings: rlconfig.Settings) -> None:
        self.meta_keys = rlconfig.meta_keys(settings.options)

    @pytest.hookimpl(hookwrapper=True, tryfirst=True)
    def pytest_runtest_setup(self, item: pytest.Item) -> Any:
        attempt = context.Attempt(item.nodeid)
        item._rl_attempt = attempt  # type: ignore[attr-defined]
        context.activate(attempt)
        yield

    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_makereport(self, item: pytest.Item, call: pytest.CallInfo) -> Any:
        outcome = yield
        attempt: Optional[context.Attempt] = getattr(item, "_rl_attempt", None)
        if attempt is None:
            return
        report = outcome.get_result()
        payload = attempt.snapshot()
        payload["worker"] = worker_index()
        payload["info"] = item_info(item, self.meta_keys)
        report.rl_payload = payload
        if call.when == "teardown":
            context.deactivate()
            item._rl_attempt = None  # type: ignore[attr-defined]


class Controller:
    """Runs in the main process only. Collects every report and writes the report at the end."""

    def __init__(self, config: pytest.Config, settings: rlconfig.Settings, collector: Collector) -> None:
        self.config = config
        self.settings = settings
        self.collector = collector
        self.lines: List[str] = []

    def pytest_sessionstart(self, session: pytest.Session) -> None:
        self.collector.start = time.time() * 1000

    def pytest_collection_finish(self, session: pytest.Session) -> None:
        keys = rlconfig.meta_keys(self.settings.options)
        for item in session.items:
            self.collector.add_collected(item.nodeid, item_info(item, keys))

    def pytest_collectreport(self, report: pytest.CollectReport) -> None:
        if report.failed:
            self.collector.add_collect_error(report)

    def pytest_runtest_logreport(self, report: pytest.TestReport) -> None:
        self.collector.add_report(report)

    def pytest_keyboard_interrupt(self, excinfo: pytest.ExceptionInfo) -> None:
        # pytest also raises Session.Interrupted when collection fails, or for --stepwise. That is not Ctrl+C.
        if type(excinfo.value).__name__ == "Interrupted":
            if self.collector.global_errors:
                self.collector.stop_reason = "pytest stopped because of errors during collection (see the errors at the top)."
            else:
                self.collector.stop_reason = f"{excinfo.value}."
            return
        self.collector.keyboard_interrupt = True

    def pytest_internalerror(self, excrepr: Any) -> None:
        text = str(excrepr)
        lines = [line for line in text.splitlines() if line.strip()]
        self.collector.add_global_error({"message": lines[-1] if lines else "pytest internal error", "stack": text})

    @pytest.hookimpl(trylast=True)
    def pytest_sessionfinish(self, session: pytest.Session, exitstatus: int) -> None:
        s = self.settings
        stop = session.shouldfail or session.shouldstop  # -x / --maxfail set shouldfail
        if self.collector.stop_reason is None and stop:
            reason = stop if isinstance(stop, str) else "the run stopped early"
            self.collector.stop_reason = f"{reason} (-x / --maxfail)." if "stopping after" in reason else f"{reason}."
        try:
            data = self.collector.build(int(exitstatus))
            raw = writer.write_raw(data, s.raw_dir)
        except Exception as e:  # never fail the test session because of the report
            self.lines.append(f"reporting-labs: could not write the report: {type(e).__name__}: {e}")
            return
        opts = s.options
        if not s.render:
            self.lines.append(f"reporting-labs: data written to {os.path.relpath(raw)} (--rl-no-render). To make the HTML run:")
            self.lines.append(f"    {render.pretty_command(s.raw_dir, s.out_dir, s.out_file)}")
            return
        result = render.render(s.raw_dir, s.out_dir, s.out_file)
        if not result.ok:
            self.lines.extend(result.lines)
            return
        if opts.get("announce", True) is not False:
            self.lines.append(f"reporting-labs: report written to {os.path.relpath(result.html)}")
            self.lines.extend(missing_meta(data["tests"], opts))
        self._maybe_open(result.html, data["runStatus"])

    def _maybe_open(self, html: Optional[Path], run_status: str) -> None:
        mode = self.settings.options.get("open") or "on-failure"
        if html is None or mode == "never" or os.environ.get("CI"):
            return
        if mode == "on-failure" and run_status == "passed":
            return
        try:
            webbrowser.open(html.resolve().as_uri())
        except Exception:
            pass  # no browser; the path was printed

    def pytest_terminal_summary(self, terminalreporter: Any) -> None:
        if not self.lines:
            return
        terminalreporter.write_line("")
        for line in self.lines:
            terminalreporter.write_line(line)


def missing_meta(tests: List[dict], options: dict) -> List[str]:
    """One short list of tests with no meta at all, like printMissingMeta in reporter.ts."""
    if options.get("warnMissingMeta") is False:
        return []
    seen = set()
    missing = []
    for t in tests:
        where = f"{t['file']}:{t['line']}"
        if not t["meta"] and where not in seen:
            seen.add(where)
            missing.append(t)
    if not missing:
        return []
    total = len({f"{t['file']}:{t['line']}" for t in tests})
    show = missing[:15]
    width = max(len(f"{t['file']}:{t['line']}") for t in show)
    lines = [f"reporting-labs: {len(missing)} of {total} tests have no meta"]
    lines += [f"    {(t['file'] + ':' + str(t['line'])).ljust(width)}  {t['title']}" for t in show]
    if len(missing) > len(show):
        lines.append(f"    … and {len(missing) - len(show)} more")
    lines.append("    Add @pytest.mark.meta(priority='P1', owner='name', feature='area'), or call rl.meta(...) in the test. "
                 "Set warnMissingMeta: false to hide this.")
    return lines
