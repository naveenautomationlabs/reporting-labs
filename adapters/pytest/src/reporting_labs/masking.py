"""Port of src/mask.ts (reporting-labs 0.6.1).

Keep in step with mask.ts: the same default keys, the same value patterns, the same
key rule (case-insensitive substring) and the same CSV parser.

One deliberate difference: in mask.ts a match with no whitespace and no `key=` part
(a bare JWT, or an `sk_...`, `ghp_...`, `AKIA...` key) keeps the token and only adds
" ****" after it. Here the whole token becomes "****".
"""
from __future__ import annotations

import re
from typing import Any, Iterable, List, Tuple

DEFAULT_KEYS = [
    "password", "passwd", "pwd", "secret", "token", "apikey", "api_key", "api-key", "authorization",
    "auth", "cookie", "set-cookie", "session", "credential", "private", "ssn", "cvv", "card",
]

VALUE_PATTERNS = [
    re.compile(r"\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"),  # JWT
    re.compile(r"\b(sk|pk|ghp|xox[abp]|AKIA)[_-]?[A-Za-z0-9]{12,}\b"),
    re.compile(r"(password|passwd|pwd|token|secret|api[_-]?key)(\s*[=:]\s*)([^\s&;,\"']+)", re.IGNORECASE),
]

MASK = "****"


def _replace(m: "re.Match[str]") -> str:
    groups = m.groups()
    if len(groups) >= 3 and groups[1] is not None and re.search(r"[=:]", groups[1]):
        return groups[0] + groups[1] + MASK
    text = m.group(0)
    parts = re.split(r"\s+", text)
    if len(parts) > 1:
        return parts[0] + " " + MASK  # "Bearer abc..." -> "Bearer ****"
    return MASK  # a bare token: mask all of it (mask.ts keeps it, see the module docstring)


class Masker:
    def __init__(self, extra_keys: Iterable[str] = ()) -> None:
        self.keys: List[str] = DEFAULT_KEYS + [str(k).lower() for k in extra_keys]

    def is_sensitive(self, key: str) -> bool:
        low = str(key).lower()
        return any(low == s or s in low for s in self.keys)

    def mask_str(self, s: str) -> str:
        for pattern in VALUE_PATTERNS:
            s = pattern.sub(_replace, s)
        return s

    def mask(self, value: Any, key: str = "") -> Any:
        if key and self.is_sensitive(key):
            return MASK
        if isinstance(value, str):
            return self.mask_str(value)
        if isinstance(value, (list, tuple)):
            return [self.mask(x) for x in value]
        if isinstance(value, dict):
            return {k: self.mask(x, str(k)) for k, x in value.items()}
        return value


def parse_csv(text: str) -> Tuple[List[str], List[List[str]]]:
    """Same small CSV reader as mask.ts: quotes toggle, commas split, cells are trimmed."""
    lines = [line for line in text.replace("\r", "").split("\n") if line.strip()]

    def split(line: str) -> List[str]:
        out: List[str] = []
        cur, quoted = "", False
        for c in line:
            if c == '"':
                quoted = not quoted
            elif c == "," and not quoted:
                out.append(cur)
                cur = ""
            else:
                cur += c
        out.append(cur)
        return [s.strip() for s in out]

    rows = [split(line) for line in lines]
    if not rows:
        return [], []
    return rows[0], rows[1:]
