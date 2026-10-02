"""pytest-rerunfailures (one ResultData per attempt, flaky) and pytest-xdist (workers to controller)."""
import json

import pytest

pytest.importorskip("pytest_rerunfailures")

FLAKY = """
    import pytest
    import reporting_labs as rl

    @pytest.mark.flaky(reruns=2)
    def test_flaky(tmp_path_factory):
        marker = tmp_path_factory.getbasetemp().parent / "flaky-ran"
        first = not marker.exists()
        marker.touch()
        rl.log("first try" if first else "second try")
        assert not first, "fails the first time"

    @pytest.mark.flaky(reruns=1)
    def test_always_fails():
        assert 1 == 2

    def test_stable():
        pass
"""


def test_rerun_attempts_and_flaky(rl_run, pytester):
    pytester.makepyfile(FLAKY)
    run = rl_run()
    t = run.test("test_flaky")
    assert t["outcome"] == "flaky" and t["retries"] == 2
    first, second = t["results"]
    assert (first["retry"], first["status"], second["retry"], second["status"]) == (0, "failed", 1, "passed")
    assert "fails the first time" in first["errors"][0]["message"] and second["errors"] == []
    assert [l["msg"] for l in first["logs"]] == ["first try"] and [l["msg"] for l in second["logs"]] == ["second try"]
    assert t["duration"] == pytest.approx(first["duration"] + second["duration"], abs=0.01)

    t = run.test("test_always_fails")
    assert t["outcome"] == "failed" and [r["status"] for r in t["results"]] == ["failed", "failed"]

    d = run.report
    assert d["stats"]["flaky"] == 1 and d["stats"]["failed"] == 1 and d["stats"]["passed"] == 1
    codes = {k.split("::")[-1]: v[0] for k, v in d["history"][-1]["tests"].items()}
    assert codes == {"test_flaky": "k", "test_always_fails": "f", "test_stable": "p"}
    assert d["history"][-1]["flaky"] == 1


def test_reruns_from_the_command_line(rl_run, pytester):
    pytester.makepyfile("def test_a(): assert False")
    t = rl_run("--reruns", "2").test("test_a")
    assert [r["retry"] for r in t["results"]] == [0, 1, 2] and t["retries"] == 2


def test_setup_failure_is_rerun(rl_run, pytester):
    pytester.makepyfile("""
        import pytest

        @pytest.fixture
        def svc():
            raise ConnectionError("svc down")

        @pytest.mark.flaky(reruns=1)
        def test_a(svc): pass
    """)
    t = rl_run().test("test_a")
    assert [r["status"] for r in t["results"]] == ["failed", "failed"]
    assert all(r["errors"][0]["message"] == "ConnectionError: svc down" for r in t["results"])


# ── xdist ───────────────────────────────────────────────────────────────────

def test_xdist_workers_send_everything_to_the_controller(rl_run, pytester):
    pytest.importorskip("xdist")
    from stub_server import start
    server, base = start()
    try:
        pytester.makepyfile(test_many=f"""
            import time
            import pytest
            import requests
            import reporting_labs as rl

            @pytest.mark.meta(owner="asha")
            @pytest.mark.parametrize("n", range(6))
            def test_n(n):
                rl.log("n is", n)
                with rl.step("call the API"):
                    assert requests.get("{base}/users/1").status_code == 200
                time.sleep(0.05)
                assert n != 5
        """, test_broken="import nope_not_here")
        pytester.makepyfile(**{"test_flaky_x": FLAKY})
        run = rl_run("-n", "2", "--rl-capture-api", "--continue-on-collection-errors", subprocess=True)
    finally:
        server.shutdown()
    d = run.report
    assert d["workers"] == 2
    many = [t for t in d["tests"] if t["file"] == "test_many.py"]
    assert len(many) == 6
    assert {r["workerIndex"] for t in many for r in t["results"]} <= {0, 1}
    for t in many:
        r = t["results"][0]
        assert t["meta"] == {"owner": "asha"} and t["line"] == 6  # pytest points at the first decorator
        assert len(r["api"]) == 1 and r["api"][0]["status"] == 200
        assert r["logs"][0]["msg"].startswith("n is ") and r["steps"][0]["title"] == "call the API"
    assert [t["outcome"] for t in many].count("failed") == 1
    assert run.test("test_flaky")["outcome"] == "flaky"
    assert len(d["globalErrors"]) == 1  # both workers report it, it is kept once
    assert d["runStatus"] == "failed"
    assert {r["k"]: r["v"] for r in d["env"]}["Workers"] == "2"
    assert sorted(p.name for p in (pytester.path / "reporting-labs" / ".raw").iterdir()) == ["report.json"]
    json.dumps(d)
