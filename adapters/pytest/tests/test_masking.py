"""Masking cases taken from src/mask.ts. tests/test_contract.py also runs mask.ts itself on the same inputs."""
import pytest

from reporting_labs.masking import DEFAULT_KEYS, Masker, parse_csv

m = Masker()

# (input, expected). Same result as mask.ts.
SAME_AS_TS = [
    ("Authorization: Bearer abcdefgh12345", "Authorization: Bearer ****"),
    ("basic   dXNlcjpwYXNzd29yZA==", "basic ****"),
    ("Token abcdefgh", "Token ****"),
    ("Bearer short", "Bearer short"),  # under 8 characters: not a token
    ("password=hunter2&x=1", "password=****&x=1"),
    ("PWD: s3cret; next", "PWD: ****; next"),
    ("api-key = abc123,other", "api-key = ****,other"),
    ("apikey:xyz", "apikey:****"),
    ('{"token":"abc"}', '{"token":"abc"}'),  # JSON text: the quote breaks `key:`; parsed objects are masked by key
    ("no secrets here", "no secrets here"),
    ("", ""),
]

# (input, expected here). mask.ts keeps the token and appends " ****" instead.
FIXED_HERE = [
    ("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk end", "jwt **** end"),
    ("key sk_live1234567890abcdef end", "key **** end"),
    ("ghp_abcdefghijklmnop1234", "****"),
    ("AKIAABCDEFGHIJKLMNOP", "****"),
    ("xoxb-123456789012abc", "****"),
]


@pytest.mark.parametrize("raw,expected", SAME_AS_TS + FIXED_HERE)
def test_mask_str(raw, expected):
    assert m.mask_str(raw) == expected


def test_sensitive_keys_are_case_insensitive_substrings():
    for k in ["Authorization", "X-Api-Key", "set-cookie", "user_password", "SessionId", "creditCard", "author"]:
        assert m.is_sensitive(k), k
    for k in ["name", "email", "status", "id"]:
        assert not m.is_sensitive(k), k


def test_default_keys_match_mask_ts():
    assert DEFAULT_KEYS == [
        "password", "passwd", "pwd", "secret", "token", "apikey", "api_key", "api-key", "authorization",
        "auth", "cookie", "set-cookie", "session", "credential", "private", "ssn", "cvv", "card",
    ]


def test_mask_nested_object():
    value = {
        "user": {"name": "Asha", "password": "p", "tokens": ["a", "b"]},
        "items": [{"cvv": 123, "note": "Bearer abcdefghijkl"}],
        "count": 3,
        "ok": True,
        "nothing": None,
    }
    assert m.mask(value) == {
        "user": {"name": "Asha", "password": "****", "tokens": "****"},
        "items": [{"cvv": "****", "note": "Bearer ****"}],
        "count": 3,
        "ok": True,
        "nothing": None,
    }


def test_array_items_do_not_inherit_the_key():
    # mask.ts: v.map(x => mask(x)), the parent key is not passed down.
    assert m.mask(["password=abc", "plain"]) == ["password=****", "plain"]


def test_extra_keys():
    assert Masker(["X-Tenant"]).mask({"x-tenant-id": "acme", "name": "a"}) == {"x-tenant-id": "****", "name": "a"}
    assert m.mask({"x-tenant-id": "acme"}) == {"x-tenant-id": "acme"}


def test_parse_csv():
    cols, rows = parse_csv('user, password\r\n"Rao, A",x\n\n b , "q"\n')
    assert cols == ["user", "password"]
    assert rows == [["Rao, A", "x"], ["b", "q"]]


def test_parse_csv_empty():
    assert parse_csv("") == ([], [])
