"""meta, tags, log, test_data, step and api, through a real pytest run."""


def test_meta_marker_tags_and_runtime_meta(rl_run, pytester):
    pytester.makeini("[pytest]\nmarkers =\n    smoke\n    P1\n    owner\n")
    pytester.makepyfile("""
        import pytest
        import reporting_labs as rl

        @pytest.mark.smoke
        @pytest.mark.meta(feature="checkout", owner="team-a", epic="EPIC-1")
        class TestCheckout:
            @pytest.mark.meta(owner="asha", story="SHOP-7", reviewer="ravi")
            def test_marker(self): pass

            def test_runtime(self):
                rl.meta(priority="P0", Severity="blocker", issue=None, testCaseId="TC-9")

        @pytest.mark.P1
        @pytest.mark.owner("nina")
        def test_tags(): pass

        def test_none(): pass
    """)
    run = rl_run()
    t = run.test("test_marker")
    assert t["tags"] == ["@smoke"]
    assert t["meta"] == {"feature": "checkout", "owner": "asha", "epic": "EPIC-1", "story": "SHOP-7"}
    assert {"type": "reviewer", "description": "ravi"} in t["annotations"]  # unknown keys stay, as annotations
    t = run.test("test_runtime")
    assert t["meta"] == {"feature": "checkout", "owner": "team-a", "epic": "EPIC-1", "priority": "P0", "severity": "blocker"}
    assert {"type": "testcaseid", "description": "TC-9"} in t["annotations"]
    t = run.test("test_tags")
    assert t["tags"] == ["@P1", "@owner:nina"] and t["meta"] == {"owner": "nina", "priority": "P1"}
    assert run.test("test_none")["meta"] == {}


def test_log_is_masked_and_sorted(rl_run, pytester):
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_a():
            rl.log("login with", {"user": "asha"}, 3, True, None)
            rl.log("header Authorization: Bearer abcdefghijklmnop")
            rl.log("password=hunter2")
    """)
    logs = rl_run().test("test_a")["results"][0]["logs"]
    assert [l["msg"] for l in logs] == ['login with {"user":"asha"} 3 true null', "header Authorization: Bearer ****", "password=****"]
    assert logs[0]["t"] <= logs[1]["t"] <= logs[2]["t"]


def test_test_data_kinds(rl_run, pytester):
    pytester.makepyfile('''
        import reporting_labs as rl

        def test_a():
            rl.test_data({"user": "asha", "password": "S3cret", "age": 30, "admin": False, "tags": ["a", 1]}, "Login")
            rl.test_data([{"sku": "A1", "qty": 2, "token": "t"}, {"sku": "B2", "price": 9.5}], "Cart")
            rl.test_data("user,password,city\\nasha,S3cret,Pune\\nravi,x,\\"Delhi, IN\\"", "Users CSV")
            rl.test_data("just a note with password=abc", "Note")
            rl.test_data(42)
    ''')
    data = rl_run().test("test_a")["results"][0]["data"]
    assert data[0] == {"name": "Login", "kind": "kv", "kv": [["user", "asha"], ["password", "****"], ["age", "30"], ["admin", "false"], ["tags", '["a",1]']]}
    assert data[1] == {"name": "Cart", "kind": "table", "columns": ["sku", "qty", "token", "price"],
                       "rows": [["A1", "2", "****", ""], ["B2", "", "", "9.5"]]}
    assert data[2] == {"name": "Users CSV", "kind": "table", "columns": ["user", "password", "city"],
                       "rows": [["asha", "****", "Pune"], ["ravi", "****", "Delhi, IN"]]}
    assert data[3] == {"name": "Note", "kind": "text", "text": "just a note with password=****"}
    assert data[4] == {"name": "Test data", "kind": "text", "text": "42"}


def test_nested_steps_and_failure(rl_run, pytester):
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_order():
            with rl.step("Create the order"):
                with rl.step("Add items"):
                    pass
                with rl.step("Pay"):
                    total = 10
                    assert total == 12, "wrong total"
    """)
    t = rl_run().test("test_order")
    steps = t["results"][0]["steps"]
    assert len(steps) == 1 and steps[0]["title"] == "Create the order" and steps[0]["category"] == "test.step"
    add, pay = steps[0]["steps"]
    assert add["title"] == "Add items" and "error" not in add
    assert pay["error"].startswith("wrong total") and steps[0]["error"].startswith("wrong total")
    assert all(isinstance(s["duration"], (int, float)) for s in (steps[0], add, pay))


def test_bdd_is_detected_from_steps(rl_run, pytester):
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_a():
            with rl.step("Given a user"):
                pass
    """)
    assert rl_run().report["bdd"] is True


def test_explicit_api_call(rl_run, pytester):
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_a():
            rl.api(method="post", url="/v1/orders", status=201, duration=138,
                   request_headers={"Authorization": "Bearer abcdefghijkl", "Content-Type": "application/json"},
                   request_body={"sku": "A1", "card": "4111"}, response_body=b'{"id": 7}', name="Create order")
            rl.api({"method": "GET", "url": "/health", "status": 200, "responseHeaders": {"set-cookie": "sid=1"}})
    """)
    api = rl_run().test("test_a")["results"][0]["api"]
    assert api[0] == {"method": "POST", "url": "/v1/orders", "status": 201, "duration": 138,
                      "requestHeaders": {"Authorization": "****", "Content-Type": "application/json"},
                      "requestBody": {"sku": "A1", "card": "****"}, "responseBody": {"id": 7}, "name": "Create order"}
    assert api[1] == {"method": "GET", "url": "/health", "status": 200, "responseHeaders": {"set-cookie": "****"}}


def test_helpers_do_nothing_without_the_report(pytester):
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_a():
            rl.log("x"); rl.meta(owner="a"); rl.test_data({"a": 1}); rl.api(method="GET", url="/")
            with rl.step("s"):
                pass
    """)
    pytester.runpytest("-p", "no:cacheprovider").assert_outcomes(passed=1)


def test_helpers_outside_a_test_are_ignored(rl_run, pytester):
    pytester.makeconftest("""
        import reporting_labs as rl
        rl.log("at import time")

        def pytest_sessionstart(session):
            rl.log("in a hook")
    """)
    pytester.makepyfile("def test_a(): pass")
    assert rl_run().test("test_a")["results"][0]["logs"] == []


def test_mask_keys_from_config(rl_run, pytester):
    (pytester.path / "reporting-labs.config.json").write_text('{"maskKeys": ["X-Tenant"]}')
    pytester.makepyfile("""
        import reporting_labs as rl

        def test_a():
            rl.test_data({"x-tenant-id": "acme", "name": "a"})
    """)
    assert rl_run().test("test_a")["results"][0]["data"][0]["kv"] == [["x-tenant-id", "****"], ["name", "a"]]


def test_errors_are_masked(rl_run, pytester):
    pytester.makepyfile("""
        def test_a():
            token = "token=abc123secret"
            assert token == "ok"
    """)
    e = rl_run().test("test_a")["results"][0]["errors"][0]
    assert "abc123secret" not in e["message"] and "abc123secret" not in e["stack"]
    assert "token=****" in e["message"]
