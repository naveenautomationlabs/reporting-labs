"""The output matches src/types.ts, and masking matches src/mask.ts. Both run the real TypeScript through tools/."""
import json
import re

import pytest

from nodetools import TOOLS, need_tools, node
from reporting_labs.masking import Masker, parse_csv
from test_masking import FIXED_HERE, SAME_AS_TS

pytestmark = pytest.mark.contract


# ── masking parity with src/mask.ts ─────────────────────────────────────────

VALUES = [
    {"user": {"name": "Asha", "password": "p", "tokens": ["a", "b"]}, "items": [{"cvv": 123, "note": "Bearer abcdefghijkl"}],
     "count": 3, "ok": True, "nothing": None},
    ["password=abc", "plain", {"Authorization": "Basic abcdefghij"}],
    {"x-tenant-id": "acme", "Set-Cookie": "sid=1", "author": "Asha K"},
]
KEYS = ["Authorization", "X-Api-Key", "user_password", "SessionId", "creditCard", "author", "name", "email", "x-tenant"]
CSV = ['user, password\r\n"Rao, A",x\n\n b , "q"\n', "", "a,b"]


def test_masking_matches_mask_ts():
    need_tools()
    strings = [raw for raw, _ in SAME_AS_TS + FIXED_HERE]
    ts = json.loads(node("mask-parity.js", stdin={"extraKeys": ["X-Tenant"], "strings": strings, "values": VALUES, "keys": KEYS, "csv": CSV}).stdout)
    m = Masker(["X-Tenant"])

    for raw, got in zip(strings[:len(SAME_AS_TS)], ts["strings"]):
        assert m.mask_str(raw) == got, raw
    # The deliberate difference: mask.ts keeps a bare token and adds " ****"; masking.py hides it.
    for (raw, ours), got in zip(FIXED_HERE, ts["strings"][len(SAME_AS_TS):]):
        assert m.mask_str(raw) == ours
        leaked = re.search(r"(eyJ\S+|sk_\S+|ghp_\S+|AKIA\S+|xox\S+)", raw).group(1)
        assert leaked + " ****" in got, (raw, got)

    assert [m.mask(v) for v in VALUES] == ts["values"]
    assert {k: m.is_sensitive(k) for k in KEYS} == ts["sensitive"]
    assert [dict(zip(["columns", "rows"], parse_csv(c))) for c in CSV] == ts["csv"]


# ── report.json matches ReportData ──────────────────────────────────────────

RICH = '''
import pytest
import requests
import reporting_labs as rl

BASE = "{base}"

@pytest.fixture
def broken():
    raise ConnectionError("db down")

@pytest.mark.smoke
@pytest.mark.meta(priority="P1", severity="critical", owner="asha", feature="users", story="API-1", reviewer="ravi")
class TestUsers:
    def test_all_helpers(self):
        rl.log("start", {{"a": 1}})
        rl.test_data({{"user": "asha", "password": "x"}}, "Login")
        rl.test_data([{{"sku": "A1"}}, {{"sku": "B2", "qty": 2}}], "Cart")
        rl.test_data("a,b\\n1,2", "CSV")
        rl.test_data("free text", "Note")
        with rl.step("Given a user"):
            with rl.step("When it is read"):
                r = requests.get(BASE + "/users/1", headers={{"Authorization": "Bearer abcdefghijkl"}})
        rl.api(method="PATCH", url="/x", status=204, duration=3.5)
        print("stdout line")
        assert r.status_code == 200

    def test_status(self):
        assert requests.get(BASE + "/missing").status_code == 200

def test_down():
    requests.get("{down}/x", timeout=2)

def test_setup(broken): pass

@pytest.mark.skip(reason="later")
def test_skip(): pass

@pytest.mark.xfail(reason="BUG-1")
def test_xfail(): assert False

@pytest.mark.xfail(reason="BUG-2")
def test_xpass(): pass

@pytest.mark.flaky(reruns=1)
def test_flaky(tmp_path_factory):
    m = tmp_path_factory.getbasetemp() / "ran"
    first = not m.exists(); m.touch()
    assert not first

@pytest.mark.parametrize("n", [1, 2])
def test_params(n): pass
'''


def rich_report(pytester, rl_run):
    from stub_server import closed_port_url, start
    server, base = start()
    try:
        (pytester.path / "reporting-labs.config.json").write_text(json.dumps({
            "title": "Contract", "metadata": {"env": "qa"}, "links": {"story": "https://j/{id}"}, "env": {"Docs": "https://d"},
            "project": {"name": "Shop", "version": "1.2"}, "sections": [{"title": "Notes", "html": "<b>hi</b>"}],
            "widgets": {"timeline": False}, "accent": "#7C3AED", "customCss": "body{}", "maskKeys": ["x-tenant"],
        }))
        pytester.makepyfile(test_rich=RICH.format(base=base, down=closed_port_url()), test_broken="import nope_nope")
        pytester.makeini("[pytest]\nmarkers =\n    smoke\n")
        rl_run("--rl-capture-api", "--continue-on-collection-errors")
        run = rl_run("--rl-capture-api", "--continue-on-collection-errors")  # second run: history with two entries
    finally:
        server.shutdown()
    return run


def test_report_matches_types_ts(pytester, rl_run):
    need_tools()
    pytest.importorskip("requests")
    pytest.importorskip("pytest_rerunfailures")
    run = rich_report(pytester, rl_run)
    d = run.report
    assert len(d["history"]) == 2 and d["globalErrors"] and d["stats"]["flaky"] == 1  # the report really has every part
    file = pytester.path / "reporting-labs" / ".raw" / "report.json"
    result = node("check-report.js", str(file), check=False)
    assert result.returncode == 0, result.stdout + result.stderr


def test_type_check_catches_a_bad_report(tmp_path):
    need_tools()
    bad = {"title": "x", "tests": [], "stats": {"passed": 0}, "runStatus": "sideways"}
    file = tmp_path / "report.json"
    file.write_text(json.dumps(bad))
    result = node("check-report.js", str(file), check=False)
    assert result.returncode != 0 and "sideways" in result.stdout + result.stderr


def test_tools_do_not_touch_the_root_project():
    pkg = json.loads((TOOLS / "package.json").read_text())
    assert pkg["private"] is True
    assert (TOOLS / "package-lock.json").is_file()
