#!/usr/bin/env python3
"""Lightweight mock Mailgun HTTP server for E2E testing.

Captures POST requests to /messages and writes request bodies to a temp
directory for assertion. Returns 200 with a fake Mailgun response.

Usage:
    python3 mock-mailgun.py [port] [output_dir]
    python3 mock-mailgun.py 19666 /tmp/mock-mailgun
"""

import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs


class MailgunHandler(BaseHTTPRequestHandler):
    request_count = 0
    output_dir = "/tmp/mock-mailgun"

    def do_POST(self):
        if "/messages" not in self.path:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"message": "not found"}')
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")

        # Parse form-encoded or JSON body
        content_type = self.headers.get("Content-Type", "")
        if "application/x-www-form-urlencoded" in content_type:
            parsed = parse_qs(body)
            # Flatten single-value lists
            data = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
        elif "application/json" in content_type:
            data = json.loads(body)
        else:
            data = {"raw": body}

        # Save captured request
        MailgunHandler.request_count += 1
        seq = MailgunHandler.request_count
        output_file = os.path.join(
            MailgunHandler.output_dir, f"email_{seq}.json"
        )
        with open(output_file, "w") as f:
            json.dump(
                {
                    "seq": seq,
                    "timestamp": time.time(),
                    "path": self.path,
                    "auth": self.headers.get("Authorization", ""),
                    "content_type": content_type,
                    "data": data,
                },
                f,
                indent=2,
            )

        # Respond like Mailgun
        response = json.dumps(
            {
                "id": f"<test-{seq}@mock.mailgun.org>",
                "message": "Queued. Thank you.",
            }
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def do_GET(self):
        """Health check and stats endpoint."""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "ok", "captured": MailgunHandler.request_count}).encode()
            )
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'{"message": "not found"}')

    def log_message(self, format, *args):
        # Prefix logs so they're easy to grep
        sys.stderr.write(f"[mock-mailgun] {args[0]}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 19666
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "/tmp/mock-mailgun"

    os.makedirs(output_dir, exist_ok=True)
    MailgunHandler.output_dir = output_dir

    server = HTTPServer(("127.0.0.1", port), MailgunHandler)
    print(f"[mock-mailgun] Listening on http://127.0.0.1:{port}")
    print(f"[mock-mailgun] Capturing emails to {output_dir}")
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print(f"\n[mock-mailgun] Captured {MailgunHandler.request_count} emails total")


if __name__ == "__main__":
    main()
