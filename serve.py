"""Local server for Sleepline.

Serves the app to this computer and to any phone or tablet on the same Wi-Fi.
Uses the Python standard library only: no dependencies, no build step.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Keep the app editable in a browser refresh, but let the service worker keep
# a copy of assets so the phone still opens when the Wi-Fi drops. Documents are
# never stored; everything else must be revalidated.
DOCUMENT_PATHS = {"/", "/index.html"}

EXTENSION_TYPES = {
    ".webmanifest": "application/manifest+json",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
}


class SleeplineHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **EXTENSION_TYPES}

    def end_headers(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in DOCUMENT_PATHS or path.endswith(".html"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        if path == "/sw.js":
            self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        super().log_message(fmt, *args)


def lan_addresses() -> list[str]:
    """Best-effort list of this machine's addresses on the local network."""
    found: set[str] = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            found.add(probe.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(address for address in found if not address.startswith("127."))


def report(host: str, port: int) -> None:
    print(f"Sleepline is running on port {port}.")
    print()
    print(f"  On this computer : http://127.0.0.1:{port}/")
    if host.startswith("127."):
        print("  On your phone    : not available (started with --local)")
    else:
        addresses = lan_addresses()
        if addresses:
            for address in addresses:
                print(f"  On your phone    : http://{address}:{port}/")
            print()
            print("  Your phone must be on the same Wi-Fi network.")
        else:
            print("  On your phone    : no local network address was found.")
            print("  Check that this computer is connected to Wi-Fi or Ethernet.")
    print()
    print("  Install it from the browser menu: Add to Home Screen.")
    print("  Offline caching and Spotify sign-in need an https:// address;")
    print("  over plain Wi-Fi the diary, charts and soundscapes all still work.")
    print()
    print("Press Ctrl+C to stop.")
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Sleepline locally, to this computer and your network.")
    parser.add_argument("--port", type=int, default=4173, help="port to listen on (default: 4173)")
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="address to bind; 0.0.0.0 exposes it to your network (default), 127.0.0.1 keeps it local",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="shortcut for --host 127.0.0.1, so only this computer can reach it",
    )
    args = parser.parse_args()

    host = "127.0.0.1" if args.local else args.host

    os.chdir(ROOT)
    try:
        server = ThreadingHTTPServer((host, args.port), SleeplineHandler)
    except OSError as error:
        print(f"Could not start on {host}:{args.port} — {error}")
        print("Another copy may already be running. Try --port 4174.")
        raise SystemExit(1)

    report(host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
