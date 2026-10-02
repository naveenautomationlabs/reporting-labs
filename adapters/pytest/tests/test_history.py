import json

from reporting_labs import history


def stats(**kw):
    s = {"passed": 0, "failed": 0, "skipped": 0, "flaky": 0, "timedOut": 0, "interrupted": 0, "total": 0}
    s.update(kw)
    return s


def tdata(key, outcome, *durations):
    return {"key": key, "outcome": outcome, "duration": sum(durations), "results": [{"duration": d} for d in durations]}


def since_info(hist, key, outcome):
    """Same logic as sinceInfo() in src/template.ts."""
    runs = [e for e in hist if e and e.get("tests")]
    prev = runs[:-1] if len(runs) > 1 else []
    if not prev or outcome not in ("failed", "timedOut", "interrupted"):
        return None
    since, seen = None, False
    for e in reversed(prev):
        r = e["tests"].get(key)
        if not r:
            continue
        seen = True
        if r[0] == "f":
            since = e
        else:
            break
    if not seen:
        return "new test"
    return "known" if since else "new"


def test_codes():
    assert [history.code(o) for o in ["passed", "flaky", "skipped", "failed", "timedOut", "interrupted"]] == ["p", "k", "s", "f", "f", "f"]


def test_entry_shape():
    tests = [tdata("::a.py::t1", "passed", 12.4), tdata("::a.py::t2", "flaky", 30, 20.6), tdata("::a.py::t3", "timedOut", 5)]
    e = history.entry(1000, 50, stats(passed=1, flaky=1, timedOut=1, total=3), tests, "#7")
    assert e == {
        "time": 1000, "duration": 50, "passed": 1, "failed": 1, "flaky": 1, "skipped": 0, "total": 3, "label": "#7",
        "tests": {"::a.py::t1": ["p", 12], "::a.py::t2": ["k", 21], "::a.py::t3": ["f", 5]},
    }
    assert "label" not in history.entry(1, 1, stats(), [], None)


def test_roll_keeps_the_last_n():
    old = [{"time": i} for i in range(40)]
    rolled = history.roll(old, {"time": 99}, keep=30)
    assert len(rolled) == 30 and rolled[-1] == {"time": 99} and rolled[0] == {"time": 11}
    assert len(history.roll(old, {"time": 99}, keep=0)) == 41  # slice(-0) keeps everything, like reporter.ts


def test_label_precedence():
    assert history.label_for({"metadata": {"build": "b1", "branch": "main"}}, "#3") == "b1"
    assert history.label_for({"metadata": {"branch": "main"}}, "#3") == "#3"
    assert history.label_for({"metadata": {"branch": "main"}}, None) == "main"
    assert history.label_for({}, None) is None


def test_load_save_round_trip(tmp_path):
    f = tmp_path / "sub" / "reporting-labs.history.json"
    assert history.load(f) == []
    history.save(f, [{"time": 1, "tests": {"k": ["p", 1]}}])
    assert history.load(f) == [{"time": 1, "tests": {"k": ["p", 1]}}]
    assert f.read_text().startswith("[\n {")  # JSON.stringify(history, null, 1)
    f.write_text("{broken")
    assert history.load(f) == []
    f.write_text(json.dumps({"not": "a list"}))
    assert history.load(f) == []


def test_new_vs_known_and_flaky_over_runs():
    h = []
    runs = [
        [tdata("k::ok", "passed", 1), tdata("k::breaks", "passed", 1), tdata("k::old", "failed", 1), tdata("k::flip", "failed", 1)],
        [tdata("k::ok", "passed", 1), tdata("k::breaks", "passed", 1), tdata("k::old", "failed", 1), tdata("k::flip", "flaky", 2, 1)],
        [tdata("k::ok", "passed", 1), tdata("k::breaks", "failed", 1), tdata("k::old", "failed", 1), tdata("k::flip", "failed", 1),
         tdata("k::brand-new", "failed", 1)],
    ]
    for i, tests in enumerate(runs):
        h = history.roll(h, history.entry(i, 1, stats(total=len(tests)), tests, f"#{i}"), 30)
    assert [e["tests"]["k::flip"][0] for e in h] == ["f", "k", "f"]
    assert since_info(h, "k::breaks", "failed") == "new"
    assert since_info(h, "k::old", "failed") == "known"
    assert since_info(h, "k::flip", "failed") == "new"
    assert since_info(h, "k::brand-new", "failed") == "new test"
    assert since_info(h, "k::ok", "passed") is None
