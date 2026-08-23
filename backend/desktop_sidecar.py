"""Eclipse Media Core entry point for the Tauri desktop sidecar."""

from __future__ import annotations

import argparse
import os
import sys

import uvicorn
import yt_dlp

from main import app

PACKAGED_YTDLP_FLAG = "--eclipse-ytdlp"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    return args


def main(argv: list[str] | None = None) -> None:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments and arguments[0] == PACKAGED_YTDLP_FLAG:
        # Only backend code constructs these arguments. The HTTP API does not expose
        # arbitrary CLI fields and subprocess calls use argv lists without a shell.
        yt_dlp.main(arguments[1:])
        return

    args = parse_args(arguments)
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
