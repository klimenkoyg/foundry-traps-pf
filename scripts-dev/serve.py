#!/usr/bin/env python3
"""Локальный сервер стендов без кеша.

    python3 scripts-dev/serve.py [порт] [--lan]

По умолчанию — порт 8766 и только этот компьютер. С --lan страницы видны в домашней сети
(например, с телефона в том же Wi-Fi) — пока сервер запущен.
"""

import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else int(os.environ.get("PORT") or 8766)
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    http.server.ThreadingHTTPServer((host, port), NoCache).serve_forever()
