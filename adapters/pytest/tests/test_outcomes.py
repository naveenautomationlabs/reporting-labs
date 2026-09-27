"""pass, fail, skip, xfail, xpass, setup/teardown errors, collection errors, Ctrl+C and -x."""


def test_off_by_default(pytester):
    pytester.makepyfile("def test_a(): pass")
    result = pytester.runpytest("-p", "no:cacheprovider")
    result.assert_outcomes(passed=1)
    assert not (pytester.path / "reporting-labs").exists()


def test_ini_turns_it_on(pytester):
    pytester.makeini("[pytest]\nreporting_labs = true\nrl_no_render = true\nrl_out = out/rl\n")
    pytester.makepyfile("def test_a(): pass")
    pytester.runpytest("-p", "no:cacheprovider").assert_outcomes(passed=1)
    assert (pytester.path / "out" / "rl" / ".raw" / "report.json").is_file()


def test_basic_shape(rl_run, pytester):
    pytester.makepyfile(test_shop="""
        class TestCart:
            class TestCoupons:
                def test_apply(self):
                    print("hello out")
                    import sys; sys.stderr.write("hello err")
    """)
    run = rl_run()
    d = run.report
    assert d["title"] == "Test report" and d["runStatus"] == "passed"
    assert d["stats"] == {"passed": 1, "failed": 0, "skipped": 0, "flaky": 0, "timedOut": 0, "interrupted": 0, "total": 1}
    assert d["projects"] == [""] and d["workers"] == 1 and d["globalErrors"] == [] and d["globalOutput"] == []
    assert d["rootDir"] == str(pytester.path.resolve())
    assert len(d["history"]) == 1 and d["history"][0]["tests"] == {"::test_shop.py::TestCart::TestCoupons::test_apply": ["p", d["tests"][0]["results"][0]["duration"].__round__()]}
    t = d["tests"][0]
    assert t["key"] == "::test_shop.py::TestCart::TestCoupons::test_apply"
    assert len(t["id"]) == 20
    assert (t["title"], t["path"], t["file"], t["line"]) == ("test_apply", ["TestCart", "TestCoupons"], "test_shop.py", 3)
    assert t["outcome"] == "passed" and t["expectedStatus"] == "passed"
    r = t["results"][0]
    assert (r["retry"], r["status"], r["workerIndex"], r["attachments"]) == (0, "passed", 0, [])
    assert r["stdout"] == ["hello out\n"] and r["stderr"] == ["hello err"]
    assert r["startTime"] > 1e12 and r["duration"] >= 0


def test_failure_message_stack_and_location(rl_run, pytester):
    pytester.makepyfile(checks="""
        def check_status(code):
            assert code == 200
    """)
    pytester.makepyfile(test_api="""
        from checks import check_status

        def test_status():
            status = 404
            check_status(status)
    """)
    pytester.makeconftest("import pytest\npytest.register_assert_rewrite('checks')")
    pytester.syspathinsert()
    t = rl_run().test("test_status")
    assert t["outcome"] == "failed"
    e = t["results"][0]["errors"][0]
    assert e["message"].startswith("assert 404 == 200")
    assert "def test_status" in e["stack"] and "E       assert 404 == 200" in e["stack"]
    assert e["location"] == {"file": "test_api.py", "line": 5, "column": 0}  # the call in the test, not the helper
    assert e["explain"]["kind"] == "api"


def test_skip_reason(rl_run, pytester):
    pytester.makepyfile("""
        import pytest

        @pytest.mark.skip(reason="payments sandbox is down")
        def test_marked(): pass

        def test_runtime():
            pytest.skip("only on staging")
    """)
    run = rl_run()
    for title, reason in [("test_marked", "payments sandbox is down"), ("test_runtime", "only on staging")]:
        t = run.test(title)
        assert t["outcome"] == "skipped" and t["expectedStatus"] == "skipped"
        assert {"type": "skip", "description": reason} in t["annotations"]
        assert t["results"][0]["status"] == "skipped"
    assert run.report["history"][-1]["tests"]["::test_skip_reason.py::test_marked"][0] == "s"


def test_xfail_and_xpass(rl_run, pytester):
    pytester.makepyfile("""
        import pytest

        @pytest.mark.xfail(reason="BUG-12")
        def test_known_bug():
            assert 1 == 2

        @pytest.mark.xfail(reason="BUG-13")
        def test_fixed_bug(): pass

        @pytest.mark.xfail(reason="BUG-14", strict=True)
        def test_fixed_strict(): pass
    """)
    run = rl_run()
    t = run.test("test_known_bug")
    assert t["outcome"] == "passed" and t["expectedFailure"] is True and t["expectedStatus"] == "failed"
    assert t["note"].startswith("Failed as expected")
    assert t["results"][0]["status"] == "failed" and t["results"][0]["errors"][0]["message"].startswith("assert 1 == 2")
    assert {"type": "fail", "description": "BUG-12"} in t["annotations"]
    for title in ("test_fixed_bug", "test_fixed_strict"):
        t = run.test(title)
        assert t["outcome"] == "failed" and "expectedFailure" not in t
        assert t["note"] == "Passed, but the test is marked xfail. If the bug is fixed, remove the marker."
        assert t["results"][0]["status"] == "passed" and t["results"][0]["errors"] == []
    d = run.report
    assert d["stats"]["passed"] == 1 and d["stats"]["failed"] == 2 and d["runStatus"] == "failed"


def test_setup_and_teardown_errors_belong_to_the_test(rl_run, pytester):
    pytester.makepyfile("""
        import pytest

        @pytest.fixture
        def db():
            raise ConnectionError("db down")

        @pytest.fixture
        def cleanup():
            yield
            raise RuntimeError("cleanup failed")

        def test_setup(db): pass

        def test_teardown(cleanup): pass

        def test_missing(nope): pass
    """)
    run = rl_run()
    t = run.test("test_setup")
    assert t["outcome"] == "failed" and t["results"][0]["errors"][0]["message"] == "ConnectionError: db down"
    t = run.test("test_teardown")
    assert t["outcome"] == "failed" and t["results"][0]["errors"][0]["message"] == "RuntimeError: cleanup failed"
    t = run.test("test_missing")
    e = t["results"][0]["errors"][0]
    assert "fixture 'nope' not found" in e["message"] and e["explain"]["kind"] == "script"


def test_collection_error_goes_to_global_errors(rl_run, pytester):
    pytester.makepyfile(test_ok="def test_ok(): pass", test_broken="import not_a_real_module\ndef test_x(): pass")
    run = rl_run()
    d = run.report
    assert len(d["globalErrors"]) == 1
    e = d["globalErrors"][0]
    assert e["message"] == "ModuleNotFoundError: No module named 'not_a_real_module'"
    assert e["location"] == {"file": "test_broken.py", "line": 1, "column": 0} and e["explain"]["kind"] == "script"
    assert d["runStatus"] == "failed"
    t = run.test("test_ok")
    assert t["outcome"] == "skipped" and t["annotations"][0]["description"].startswith("Not run: pytest stopped because of errors during collection")


def test_keyboard_interrupt(rl_run, pytester):
    pytester.makepyfile("""
        def test_a(): pass
        def test_b(): raise KeyboardInterrupt
        def test_c(): pass
    """)
    run = rl_run()
    d = run.report
    assert d["runStatus"] == "interrupted"
    assert run.test("test_a")["outcome"] == "passed"
    b = run.test("test_b")
    assert b["outcome"] == "interrupted" and b["note"] == "The run was interrupted while this test was executing."
    c = run.test("test_c")
    assert c["outcome"] == "interrupted" and c["results"] == [] and c["note"].startswith("This test never ran")


def test_exitfirst(rl_run, pytester):
    pytester.makepyfile("""
        def test_a(): assert False
        def test_b(): pass
    """)
    run = rl_run("-x")
    assert run.report["runStatus"] == "failed"
    b = run.test("test_b")
    assert b["outcome"] == "skipped" and b["results"] == []
    assert b["annotations"] == [{"type": "skip", "description": "Not run: stopping after 1 failures (-x / --maxfail)."}]


def test_title_and_config_file(rl_run, pytester):
    (pytester.path / "reporting-labs.config.json").write_text('{"title": "From JSON", "metadata": {"env": "qa", "build": "b7"}, "theme": "dark"}')
    pytester.makepyfile("def test_a(): pass")
    d = rl_run().report
    assert d["title"] == "From JSON" and d["metadata"] == {"env": "qa", "build": "b7"} and d["options"]["theme"] == "dark"
    assert d["history"][-1]["label"] == "b7"
    d = rl_run("--rl-title", "From CLI").report
    assert d["title"] == "From CLI" and len(d["history"]) == 2


def test_parametrized_ids_are_distinct(rl_run, pytester):
    pytester.makepyfile("""
        import pytest
        @pytest.mark.parametrize("code", [200, 404])
        def test_codes(code): pass
    """)
    d = rl_run().report
    assert [t["title"] for t in d["tests"]] == ["test_codes[200]", "test_codes[404]"]
    assert len({t["id"] for t in d["tests"]}) == 2


def test_pytest_timeout_is_timed_out(rl_run, pytester):
    import pytest
    pytest.importorskip("pytest_timeout")
    pytester.makepyfile("""
        import time
        import pytest

        @pytest.mark.timeout(0.5)
        def test_slow():
            time.sleep(3)
    """)
    t = rl_run().test("test_slow")
    assert t["outcome"] == "timedOut" and t["timeout"] == 500
    assert t["results"][0]["status"] == "timedOut"
    assert t["note"] == "Exceeded the 500ms timeout."
    assert t["results"][0]["errors"][0]["explain"]["kind"] == "test-timeout"
