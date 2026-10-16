"""A minimal local HTTP server for tests that need real sockets."""

from __future__ import annotations

import sys
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterator


class _JSONHandler(BaseHTTPRequestHandler):
    # Keep-alive, so the client pools connections as it would with SDNext.
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        body = b"{}"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        pass


class _QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address) -> None:
        # A client closing its pooled keep-alive connection resets it while
        # the handler waits for the next request; that is not an error.
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


@contextmanager
def serve_json() -> Iterator[str]:
    """Serve ``{}`` for every GET on a free local port; yield the base URL."""
    server = _QuietServer(("127.0.0.1", 0), _JSONHandler)
    server.daemon_threads = True
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True
    )
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
