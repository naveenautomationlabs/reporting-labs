import pytest

import reporting_labs as rl

# rl.log() adds a timestamped line to the test. Lines with "error" or "fail" show red, "warn" amber.
# rl.test_data() shows the data a test used: a dict as key/value, a list of dicts or a CSV
# string as a table, any other string as text. Passwords, tokens and keys show as ****.

USERS_CSV = """name,email,password,status
Asha Rao,asha@example.com,S3cret!,active
Ravi Kumar,ravi@example.com,hunter2,inactive
"""


@pytest.mark.meta(priority="P1", severity="major", owner="asha", feature="users")
def test_create_user_from_data(api, base_url):
    new_user = {"name": "Meera Iyer", "email": "meera@example.com", "status": "active", "password": "not-sent"}
    rl.test_data(new_user, "New user")
    rl.log("creating user", new_user["email"])

    r = api.post(f"{base_url}/users", json={k: v for k, v in new_user.items() if k != "password"})
    rl.log("got id", r.json().get("id"))
    assert r.status_code == 201


@pytest.mark.meta(priority="P2", severity="minor", owner="ravi", feature="users")
def test_table_data(base_url):
    rl.test_data(USERS_CSV, "Users (CSV)")
    rl.test_data([{"sku": "A1", "qty": 2, "price": 9.5}, {"sku": "B2", "qty": 1, "price": 20}], "Cart")
    rl.log("warn: the cart has no discount code")
    rl.log("token=abc123 is masked in the report too")
