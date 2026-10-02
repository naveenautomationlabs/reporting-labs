"""A small fake shop API that runs on your machine, so the examples need no network.

Rules, like gorest.in:
- GET is open.
- POST / PATCH / DELETE need `Authorization: Bearer <any string>`.
- The token `blocked-token` always gets 403.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict
from urllib.parse import parse_qs, urlparse

USERS: Dict[int, dict] = {1: {"id": 1, "name": "Asha Rao", "email": "asha@example.com", "status": "active"}}
LOCK = threading.Lock()


class ShopHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status: int, body=None) -> None:
        raw = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def allowed(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            self.reply(401, {"message": "Authentication failed"})
            return False
        if auth == "Bearer blocked-token":
            self.reply(403, {"message": "This token is blocked"})
            return False
        return True

    def user_id(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        return int(parts[1]) if len(parts) == 2 and parts[0] == "users" and parts[1].isdigit() else None

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/users":
            q = parse_qs(url.query)
            users = [u for u in USERS.values() if not q.get("status") or u["status"] == q["status"][0]]
            return self.reply(200, users[: int(q.get("per_page", ["10"])[0])])
        if url.path == "/health":
            return self.reply(200, {"status": "ok"})
        uid = self.user_id()
        if uid in USERS:
            return self.reply(200, USERS[uid])
        if url.path == "/orders/slow-report":
            return self.reply(503, {"message": "Report service is warming up"})
        self.reply(404, {"message": "Resource not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/users":
            return self.reply(404, {"message": "Resource not found"})
        if not self.allowed():
            return
        data = self.body()
        missing = [f for f in ("name", "email", "status") if not data.get(f)]
        if missing:
            return self.reply(422, [{"field": f, "message": "can't be blank"} for f in missing])
        with LOCK:
            uid = max(USERS) + 1
            USERS[uid] = {"id": uid, **{k: data[k] for k in ("name", "email", "status")}}
        self.reply(201, USERS[uid])

    def do_PATCH(self):
        uid = self.user_id()
        if not self.allowed():
            return
        if uid not in USERS:
            return self.reply(404, {"message": "Resource not found"})
        USERS[uid].update({k: v for k, v in self.body().items() if k in ("name", "email", "status")})
        self.reply(200, USERS[uid])

    def do_DELETE(self):
        uid = self.user_id()
        if not self.allowed():
            return
        if USERS.pop(uid, None) is None:
            return self.reply(404, {"message": "Resource not found"})
        self.reply(204)


def start():
    server = ThreadingHTTPServer(("127.0.0.1", 0), ShopHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"
