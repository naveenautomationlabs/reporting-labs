"""Automatic capture of requests and httpx calls against a local stub API."""
import pytest

from stub_server import closed_port_url, start

pytest.importorskip("requests")


@pytest.fixture(scope="module")
def base():
    server, url = start()
    yield url
    server.shutdown()


def calls(run, title):
    return run.test(title)["results"][0]["api"]


def test_requests_2xx_4xx_5xx_and_connection_error(rl_run, pytester, base):
    down = closed_port_url()
    pytester.makepyfile(f"""
        import requests

        BASE = "{base}"

        def test_ok():
            r = requests.get(BASE + "/users/1", headers={{"Authorization": "Bearer abcdefghijklmnop", "X-Trace": "t1"}})
            assert r.status_code == 200
            r = requests.post(BASE + "/users", json={{"name": "Ravi", "password": "pw"}})
            assert r.status_code == 201

        def test_not_found():
            r = requests.get(BASE + "/missing")
            assert r.status_code == 200

        def test_server_error():
            assert requests.get(BASE + "/boom").status_code == 200

        def test_down():
            requests.get("{down}/users", timeout=2)
    """)
    run = rl_run("--rl-capture-api")
    get, post = calls(run, "test_ok")
    assert get["method"] == "GET" and get["url"] == f"{base}/users/1" and get["status"] == 200
    assert isinstance(get["duration"], int) and get["duration"] >= 0
    assert get["requestHeaders"]["Authorization"] == "****" and get["requestHeaders"]["X-Trace"] == "t1"
    assert get["responseHeaders"]["Content-Type"] == "application/json" and get["responseHeaders"]["Set-Cookie"] == "****"
    assert get["responseBody"] == {"id": 1, "name": "Asha", "token": "****"}
    assert "requestBody" not in get
    assert post["method"] == "POST" and post["status"] == 201
    assert post["requestBody"] == {"name": "Ravi", "password": "****"}
    assert post["responseBody"] == {"id": 2, "name": "Ravi", "password": "****"}

    (nf,) = calls(run, "test_not_found")
    assert nf["status"] == 404 and nf["responseBody"] == {"error": "not found"}
    e = run.test("test_not_found")["results"][0]["errors"][0]
    assert e["explain"]["kind"] == "api" and e["explain"]["summary"] == "The API returned status 404, the test expected 200."

    (boom,) = calls(run, "test_server_error")
    assert boom["status"] == 500 and boom["responseBody"] == "internal error"

    (dn,) = calls(run, "test_down")
    assert "status" not in dn and "responseHeaders" not in dn
    assert dn["url"] == f"{down}/users" and dn["responseBody"].startswith("Request failed: ConnectionError:")
    e = run.test("test_down")["results"][0]["errors"][0]
    assert e["explain"]["kind"] == "api" and "nothing is listening" in e["explain"]["summary"]


def test_redirect_is_one_call_with_the_final_url(rl_run, pytester, base):
    pytester.makepyfile(f"""
        import requests
        def test_a():
            assert requests.get("{base}/redirect").json()["id"] == 1
    """)
    (c,) = calls(rl_run("--rl-capture-api"), "test_a")
    assert c["url"] == f"{base}/users/1" and c["status"] == 200


def test_bodies_binary_form_html_and_truncation(rl_run, pytester, base):
    pytester.makeini("[pytest]\nrl_capture_api = true\nrl_api_max_body = 1000\n")
    pytester.makepyfile(f"""
        import requests
        def test_a():
            requests.get("{base}/image")
            requests.get("{base}/big")
            requests.post("{base}/form", data={{"q": "shoes", "page": "2"}})
            requests.get("{base}/html")
            requests.get("{base}/users/1", stream=True).close()
    """)
    image, big, form, html, streamed = calls(rl_run(), "test_a")
    assert image["responseBody"] == "<image/png 108 bytes>"
    assert big["responseBody"] == "x" * 1000 + "\n… truncated (5000 bytes)"
    assert form["requestBody"] == {"q": "shoes", "page": "2"}
    assert html["responseBody"] == "<html>oops</html>"
    assert streamed["responseBody"] == "<streamed response, not read>"


def test_capture_is_off_without_the_flag(rl_run, pytester, base):
    pytester.makepyfile(f"""
        import requests
        def test_a():
            requests.get("{base}/users/1")
    """)
    assert calls(rl_run(), "test_a") == []


def test_httpx_sync_and_async(rl_run, pytester, base):
    pytest.importorskip("httpx")
    down = closed_port_url()
    pytester.makepyfile(f"""
        import asyncio
        import httpx
        import pytest

        def test_sync():
            with httpx.Client() as c:
                assert c.get("{base}/users/1").status_code == 200
                c.post("{base}/users", json={{"name": "Nina"}})

        def test_async():
            async def go():
                async with httpx.AsyncClient() as c:
                    return await c.get("{base}/missing")
            assert asyncio.run(go()).status_code == 404

        def test_down():
            with pytest.raises(httpx.ConnectError):
                httpx.get("{down}/x")
    """)
    run = rl_run("--rl-capture-api")
    get, post = calls(run, "test_sync")
    assert get["status"] == 200 and get["responseBody"]["token"] == "****"
    assert post["status"] == 201 and post["requestBody"] == {"name": "Nina"}
    (a,) = calls(run, "test_async")
    assert a["status"] == 404 and a["url"] == f"{base}/missing"
    (d,) = calls(run, "test_down")
    assert "status" not in d and d["responseBody"].startswith("Request failed: ConnectError")


def test_session_fixture_calls_land_on_the_first_and_last_test(rl_run, pytester, base):
    pytester.makepyfile(f"""
        import pytest
        import requests

        @pytest.fixture(scope="session")
        def token():
            requests.get("{base}/users/1")
            yield "t"
            requests.get("{base}/missing")

        def test_first(token): pass
        def test_middle(token): pass
        def test_last(token): pass
    """)
    run = rl_run("--rl-capture-api")
    assert [c["url"] for c in calls(run, "test_first")] == [f"{base}/users/1"]
    assert calls(run, "test_middle") == []
    assert [c["url"] for c in calls(run, "test_last")] == [f"{base}/missing"]


def test_calls_from_threads_are_kept(rl_run, pytester, base):
    pytester.makepyfile(f"""
        import threading
        import requests

        def test_a():
            t = threading.Thread(target=lambda: requests.get("{base}/users/1"))
            t.start(); t.join()
    """)
    assert len(calls(rl_run("--rl-capture-api"), "test_a")) == 1


def test_patch_is_removed_after_the_run(rl_run, pytester, base):
    import requests
    before = requests.Session.send
    pytester.makepyfile("def test_a(): pass")
    rl_run("--rl-capture-api")
    assert requests.Session.send is before
