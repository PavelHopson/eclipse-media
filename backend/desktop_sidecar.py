"""Eclipse Media Core entry point for the Tauri desktop sidecar."""

from __future__ import annotations

import argparse
import ctypes
import os
import sys
import threading

import uvicorn
import yt_dlp

from main import app

PACKAGED_YTDLP_FLAG = "--eclipse-ytdlp"
PARENT_PID_ENV = "ECLIPSE_MEDIA_PARENT_PID"


def parse_parent_pid(value: str | None) -> int | None:
    """Parse the desktop PID from the shell-controlled environment."""
    if value is None or value == "":
        return None
    if not value.isascii() or not value.isdecimal():
        raise SystemExit("Desktop parent PID is invalid")
    parent_pid = int(value)
    if not 1 <= parent_pid <= 0xFFFFFFFF or parent_pid == os.getpid():
        raise SystemExit("Desktop parent PID is invalid")
    return parent_pid


def _wait_for_windows_parent(parent_pid: int) -> None:
    """Exit this worker when its Tauri desktop owner disappears."""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
    kernel32.OpenProcess.restype = ctypes.c_void_p
    kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel32.WaitForSingleObject.restype = ctypes.c_uint32
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_int

    synchronize = 0x00100000
    wait_forever = 0xFFFFFFFF
    wait_object_0 = 0
    invalid_parameter = 87

    handle = kernel32.OpenProcess(synchronize, False, parent_pid)
    if not handle:
        # ERROR_INVALID_PARAMETER means the desktop process is already gone.
        # Other failures (for example a transient access policy) fail open so
        # the media worker does not disappear while its owner is still alive.
        if ctypes.get_last_error() == invalid_parameter:
            os._exit(0)
        return

    try:
        if kernel32.WaitForSingleObject(handle, wait_forever) == wait_object_0:
            os._exit(0)
    finally:
        kernel32.CloseHandle(handle)


def start_parent_watchdog(parent_pid: int | None) -> None:
    if parent_pid is None or os.name != "nt":
        return
    threading.Thread(
        target=_wait_for_windows_parent,
        args=(parent_pid,),
        name="eclipse-media-parent-watchdog",
        daemon=True,
    ).start()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    return args


def main(argv: list[str] | None = None) -> None:
    arguments = list(sys.argv[1:] if argv is None else argv)
    start_parent_watchdog(parse_parent_pid(os.environ.get(PARENT_PID_ENV)))
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
