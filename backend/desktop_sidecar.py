"""Eclipse Media Core entry point for the Tauri desktop sidecar."""

from __future__ import annotations

import argparse
import os

import uvicorn

from main import app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    return args


def main() -> None:
    args = parse_args()
    token = os.environ.get("ECLIPSE_MEDIA_SESSION_TOKEN", "")
    if len(token) < 43:
        raise SystemExit("Desktop session token is required")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        access_log=False,
        server_header=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
