"""A tiny local HTTP API for the API capture tests. No network needed."""
from __future__ import annotations

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Tuple


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep test output clean
        pass

    def _send(self, status: int, body: bytes, content_type: str = "application/json", extra=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Set-Cookie", "sid=abc123")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, value) -> None:
        self._send(status, json.dumps(value).encode())

    def do_GET(self):
        if self.path == "/users/1":
            self._json(200, {"id": 1, "name": "Asha", "token": "secret-token"})
        elif self.path == "/missing":
            self._json(404, {"error": "not found"})
        elif self.path == "/boom":
            self._send(500, b"internal error", "text/plain")
        elif self.path == "/redirect":
            self._send(302, b"", "text/plain", {"Location": "/users/1"})
        elif self.path == "/image":
            self._send(200, b"\x89PNG\r\n\x1a\n" + b"\x00" * 100, "image/png")
        elif self.path == "/big":
            self._send(200, b"x" * 5000, "text/plain")
        elif self.path == "/html":
            self._send(200, b"<html>oops</html>", "text/html")
        else:
            self._json(404, {"error": "no route"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        if self.headers.get("Content-Type", "").startswith("application/json"):
            self._json(201, {"id": 2, **json.loads(raw or b"{}")})
        else:
            self._json(200, {"got": raw.decode()})


def start() -> Tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def closed_port_url() -> str:
    """A URL where nothing listens, for connection refused."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}"
