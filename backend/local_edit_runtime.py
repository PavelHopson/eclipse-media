"""Desktop-only local MP4 trim runtime with a fixed FFmpeg profile.

The browser never supplies paths or FFmpeg arguments. A completed download is
copied into an immutable staging area, hashed, probed and bound to the approval
contract before a worker is started. Public production keeps this runtime off.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Callable

from local_edit_contract import (
    APPROVAL_TTL_SECONDS,
    EditContractError,
    EditPlan,
    LocalExportGate,
    MAX_SOURCE_BYTES,
    RunScope,
    SourceSnapshot,
    parse_edit_plan,
)


JOB_ID_RE = re.compile(r"[0-9a-f]{32}")
MAX_OUTPUT_BYTES = 512 * 1024 * 1024
WORKER_TIMEOUT_SECONDS = 180
PROBE_TIMEOUT_SECONDS = 15
TERMINAL_STATES = {"succeeded", "failed", "cancelled"}


class LocalEditRuntimeError(RuntimeError):
    """Fixed error code only; never echo a path, token or FFmpeg output."""


@dataclass(frozen=True)
class RegisteredSource:
    job_id: str
    asset_id: str
    filename: str
    sha256: str
    size_bytes: int
    duration_ms: int
    has_audio: bool
    registered_at: float
    path: Path = field(repr=False)

    def public(self) -> dict:
        return {
            "jobId": self.job_id,
            "assetId": self.asset_id,
            "filename": self.filename,
            "sha256": self.sha256,
            "sizeBytes": self.size_bytes,
            "durationMs": self.duration_ms,
            "hasAudio": self.has_audio,
        }


@dataclass
class _EditRun:
    run_id: str
    source: RegisteredSource
    scope: RunScope
    plan: EditPlan
    gate: LocalExportGate = field(repr=False)
    approval_token: str | None = field(default=None, repr=False)
    state: str = "approved"
    phase: str = "waiting"
    created_at: float = field(default_factory=time.time)
    process: subprocess.Popen | None = field(default=None, repr=False)
    cancel_requested: bool = False
    result_job_id: str | None = None
    output_filename: str | None = None
    output_sha256: str | None = None
    output_size_bytes: int | None = None
    error_code: str | None = None

    def public(self) -> dict:
        payload = {
            "runId": self.run_id,
            "state": self.state,
            "phase": self.phase,
            "createdAt": self.created_at,
            "planDigest": self.plan.digest,
            "source": self.source.public(),
        }
        if self.result_job_id:
            payload["result"] = {
                "jobId": self.result_job_id,
                "filename": self.output_filename,
                "sha256": self.output_sha256,
                "sizeBytes": self.output_size_bytes,
                "durationMs": self.plan.end_ms - self.plan.start_ms,
            }
        if self.error_code:
            payload["errorCode"] = self.error_code
        return payload


def _safe_filename(value: object, fallback: str = "clip.mp4") -> str:
    if not isinstance(value, str):
        return fallback
    name = Path(value).name.strip().replace("\x00", "")
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = name.strip(" .")[:180]
    if not name or name in {".", ".."}:
        return fallback
    stem = Path(name).stem[:160].strip(" .") or "clip"
    return f"{stem}.mp4"


def _hash_file(path: Path) -> tuple[str, int]:
    digest = sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def _minimal_worker_env() -> dict[str, str]:
    allowed = ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME")
    return {key: os.environ[key] for key in allowed if os.environ.get(key)}


class LocalEditRuntime:
    def __init__(
        self,
        download_dir: str | Path,
        *,
        enabled: bool,
        on_success: Callable[[str, Path, str], None] | None = None,
        ffmpeg: str | None = None,
        ffprobe: str | None = None,
    ):
        self.download_dir = Path(download_dir).resolve()
        self.enabled = bool(enabled)
        self._root = self.download_dir / ".local-edit"
        self._source_root = self._root / "sources"
        self._run_root = self._root / "runs"
        self._on_success = on_success
        self._ffmpeg = ffmpeg or shutil.which("ffmpeg")
        self._ffprobe = ffprobe or shutil.which("ffprobe")
        self._lock = threading.RLock()
        self._sources: dict[str, RegisteredSource] = {}
        self._runs: dict[str, _EditRun] = {}
        self._workspace_id = str(uuid.uuid4())
        self._user_id = str(uuid.uuid4())
        self._employee_id = str(uuid.uuid4())
        if self.enabled:
            for directory in (self._root, self._source_root, self._run_root):
                directory.mkdir(parents=True, exist_ok=True)
                if directory.is_symlink() or not directory.is_dir():
                    raise RuntimeError("Local edit workspace must be a real directory")

    def capability(self) -> dict:
        ready = bool(self.enabled and self._ffmpeg and self._ffprobe)
        return {
            "enabled": self.enabled,
            "ready": ready,
            "mode": "desktop-local" if self.enabled else "preview-only",
            "profile": "mp4-h264-aac-720p-v1",
            "maxSourceBytes": 256 * 1024 * 1024,
            "maxSourceMs": 5 * 60 * 1000,
            "maxClipMs": 60 * 1000,
            "reason": None if ready else (
                "LOCAL_EDIT_DISABLED" if not self.enabled else "FFMPEG_UNAVAILABLE"
            ),
        }

    def _require_ready(self) -> None:
        if not self.enabled:
            raise LocalEditRuntimeError("LOCAL_EDIT_DISABLED")
        if not self._ffmpeg or not self._ffprobe:
            raise LocalEditRuntimeError("FFMPEG_UNAVAILABLE")

    def _scope(self, run_id: str) -> RunScope:
        return RunScope(
            self._workspace_id,
            self._user_id,
            self._employee_id,
            run_id,
            1,
        )

    def _trusted_job_path(self, job_id: str, job: dict) -> Path:
        if JOB_ID_RE.fullmatch(job_id) is None or job.get("status") != "done":
            raise LocalEditRuntimeError("SOURCE_NOT_READY")
        raw = job.get("file")
        if not isinstance(raw, str):
            raise LocalEditRuntimeError("SOURCE_NOT_READY")
        path = Path(raw)
        try:
            resolved = path.resolve(strict=True)
            resolved.relative_to(self.download_dir)
        except (OSError, ValueError):
            raise LocalEditRuntimeError("SOURCE_OUTSIDE_REGISTRY") from None
        if path.is_symlink() or not resolved.is_file() or resolved.suffix.lower() != ".mp4":
            raise LocalEditRuntimeError("UNSUPPORTED_SOURCE")
        size = resolved.stat().st_size
        if not 0 < size <= MAX_SOURCE_BYTES:
            raise LocalEditRuntimeError("SOURCE_LIMIT_EXCEEDED")
        return resolved

    def _copy_immutable(self, source: Path, destination: Path) -> tuple[str, int]:
        before = source.stat()
        digest = sha256()
        size = 0
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        source_fd = os.open(source, flags)
        try:
            with os.fdopen(source_fd, "rb", closefd=False) as reader, destination.open("xb") as writer:
                while chunk := reader.read(1024 * 1024):
                    writer.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                writer.flush()
                os.fsync(writer.fileno())
        finally:
            os.close(source_fd)
        after = source.stat()
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ) or size != before.st_size:
            destination.unlink(missing_ok=True)
            raise LocalEditRuntimeError("SOURCE_CHANGED")
        try:
            destination.chmod(0o400)
        except OSError:
            pass
        return digest.hexdigest(), size

    def _probe(self, path: Path) -> dict:
        command = [
            str(self._ffprobe), "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height",
            "-of", "json", str(path),
        ]
        try:
            result = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=PROBE_TIMEOUT_SECONDS,
                env=_minimal_worker_env(),
                check=False,
            )
            if result.returncode != 0 or len(result.stdout) > 128 * 1024:
                raise LocalEditRuntimeError("INVALID_MEDIA")
            data = json.loads(result.stdout)
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
            raise LocalEditRuntimeError("INVALID_MEDIA") from None
        if not isinstance(data, dict) or not isinstance(data.get("streams"), list):
            raise LocalEditRuntimeError("INVALID_MEDIA")
        return data

    @staticmethod
    def _duration_ms(probe: dict) -> int:
        try:
            duration = float(probe["format"]["duration"])
        except (KeyError, TypeError, ValueError, OverflowError):
            raise LocalEditRuntimeError("INVALID_MEDIA") from None
        if not 0 < duration <= 300:
            raise LocalEditRuntimeError("SOURCE_LIMIT_EXCEEDED")
        return max(1, round(duration * 1000))

    def register_job(self, job_id: str, job: dict) -> dict:
        self._require_ready()
        with self._lock:
            existing = self._sources.get(job_id)
            if existing:
                return existing.public()
        source_path = self._trusted_job_path(job_id, job)
        asset_id = str(uuid.uuid4())
        staged = self._source_root / f"{asset_id}.mp4"
        try:
            digest, size = self._copy_immutable(source_path, staged)
            probe = self._probe(staged)
            duration_ms = self._duration_ms(probe)
            has_video = any(stream.get("codec_type") == "video" for stream in probe["streams"])
            has_audio = any(stream.get("codec_type") == "audio" for stream in probe["streams"])
            if not has_video:
                raise LocalEditRuntimeError("INVALID_MEDIA")
            snapshot = SourceSnapshot(
                asset_id,
                self._workspace_id,
                self._user_id,
                digest,
                size,
                duration_ms,
            )
            source = RegisteredSource(
                job_id=job_id,
                asset_id=snapshot.asset_id,
                filename=_safe_filename(job.get("filename"), "source.mp4"),
                sha256=snapshot.sha256,
                size_bytes=snapshot.size_bytes,
                duration_ms=snapshot.duration_ms,
                has_audio=has_audio,
                registered_at=time.time(),
                path=staged,
            )
        except Exception:
            staged.unlink(missing_ok=True)
            raise
        with self._lock:
            winner = self._sources.setdefault(job_id, source)
        if winner is not source:
            staged.unlink(missing_ok=True)
        return winner.public()

    def _source_snapshot(self, source: RegisteredSource) -> SourceSnapshot:
        return SourceSnapshot(
            source.asset_id,
            self._workspace_id,
            self._user_id,
            source.sha256,
            source.size_bytes,
            source.duration_ms,
        )

    def approve(self, plan_json: str, *, rights_confirmed: bool) -> dict:
        self._require_ready()
        if rights_confirmed is not True:
            raise LocalEditRuntimeError("HUMAN_APPROVAL_REQUIRED")
        run_id = str(uuid.uuid4())
        scope = self._scope(run_id)
        with self._lock:
            sources = tuple(self._sources.values())
        selected: RegisteredSource | None = None
        plan: EditPlan | None = None
        for source in sources:
            try:
                candidate = parse_edit_plan(plan_json, self._source_snapshot(source), scope)
            except EditContractError:
                continue
            selected, plan = source, candidate
            break
        if selected is None or plan is None:
            raise LocalEditRuntimeError("SOURCE_NOT_REGISTERED")
        gate = LocalExportGate(scope)
        approval = gate.approve(
            plan,
            self._source_snapshot(selected),
            scope,
            approved_by=self._user_id,
            rights_confirmed=True,
        )
        run = _EditRun(run_id, selected, scope, plan, gate, approval.token)
        with self._lock:
            self._runs[run_id] = run
        return {
            "runId": run_id,
            "approvalToken": approval.token,
            "expiresInSeconds": APPROVAL_TTL_SECONDS,
            "planDigest": plan.digest,
        }

    def start(self, run_id: str, approval_token: str, plan_json: str) -> dict:
        self._require_ready()
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise LocalEditRuntimeError("RUN_NOT_FOUND")
            if run.state != "approved":
                raise LocalEditRuntimeError("RUN_ALREADY_STARTED")
            if any(item.state in {"queued", "running"} for item in self._runs.values()):
                raise LocalEditRuntimeError("EXPORT_BUSY")
            plan = parse_edit_plan(plan_json, self._source_snapshot(run.source), run.scope)
            authorization = run.gate.authorize(
                approval_token,
                plan,
                self._source_snapshot(run.source),
                run.scope,
            )
            run.approval_token = None
            run.state = "queued"
            run.phase = "verifying"
            worker = threading.Thread(
                target=self._execute,
                args=(run, authorization),
                daemon=True,
                name=f"local-edit-{run_id[:8]}",
            )
            worker.start()
            return run.public()

    def _command(self, run: _EditRun, partial: Path) -> list[str]:
        start = f"{run.plan.start_ms / 1000:.3f}"
        duration = f"{(run.plan.end_ms - run.plan.start_ms) / 1000:.3f}"
        return [
            str(self._ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error",
            "-protocol_whitelist", "file,pipe,crypto,data",
            "-ss", start, "-i", str(run.source.path), "-t", duration,
            "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
            "-map_chapters", "-1", "-sn", "-dn",
            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-threads", "2",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            "-y", str(partial),
        ]

    def _validate_output(self, path: Path, run: _EditRun) -> tuple[str, int]:
        if path.is_symlink() or not path.is_file():
            raise LocalEditRuntimeError("OUTPUT_INVALID")
        digest, size = _hash_file(path)
        if not 0 < size <= MAX_OUTPUT_BYTES:
            raise LocalEditRuntimeError("OUTPUT_LIMIT_EXCEEDED")
        probe = self._probe(path)
        videos = [stream for stream in probe["streams"] if stream.get("codec_type") == "video"]
        audios = [stream for stream in probe["streams"] if stream.get("codec_type") == "audio"]
        if len(videos) != 1 or videos[0].get("codec_name") != "h264":
            raise LocalEditRuntimeError("OUTPUT_PROFILE_MISMATCH")
        if (videos[0].get("width"), videos[0].get("height")) != (1280, 720):
            raise LocalEditRuntimeError("OUTPUT_PROFILE_MISMATCH")
        if run.source.has_audio and (len(audios) != 1 or audios[0].get("codec_name") != "aac"):
            raise LocalEditRuntimeError("OUTPUT_PROFILE_MISMATCH")
        actual = self._duration_ms(probe)
        expected = run.plan.end_ms - run.plan.start_ms
        if abs(actual - expected) > 2500:
            raise LocalEditRuntimeError("OUTPUT_PROFILE_MISMATCH")
        return digest, size

    def _execute(self, run: _EditRun, authorization) -> None:
        run_dir = self._run_root / run.run_id
        result_job_id = uuid.uuid4().hex
        partial = run_dir / "output.partial.mp4"
        final = self.download_dir / f"{result_job_id}.mp4"
        try:
            run_dir.mkdir(parents=True, exist_ok=False)
            with self._lock:
                if run.cancel_requested:
                    raise LocalEditRuntimeError("RUN_CANCELLED")
                run.state = "running"
                run.phase = "verifying"
            current_hash, current_size = _hash_file(run.source.path)
            if (current_hash, current_size) != (run.source.sha256, run.source.size_bytes):
                raise LocalEditRuntimeError("SOURCE_CHANGED")
            command = self._command(run, partial)
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            with self._lock:
                run.phase = "encoding"
                run.process = subprocess.Popen(
                    command,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    env=_minimal_worker_env(),
                    shell=False,
                    creationflags=creation_flags,
                )
                process = run.process
            deadline = time.monotonic() + WORKER_TIMEOUT_SECONDS
            while process.poll() is None:
                if run.cancel_requested or time.monotonic() >= deadline:
                    process.kill()
                    process.wait(timeout=5)
                    code = "RUN_CANCELLED" if run.cancel_requested else "WORKER_TIMEOUT"
                    raise LocalEditRuntimeError(code)
                time.sleep(0.1)
            if process.returncode != 0:
                raise LocalEditRuntimeError("ENCODER_FAILED")
            with self._lock:
                run.phase = "validating"
            digest, size = self._validate_output(partial, run)
            run.gate.assert_active(
                authorization,
                run.plan,
                self._source_snapshot(run.source),
                run.scope,
            )
            if run.cancel_requested:
                raise LocalEditRuntimeError("RUN_CANCELLED")
            os.replace(partial, final)
            output_filename = _safe_filename(
                f"{Path(run.source.filename).stem}-clip.mp4",
                "eclipse-clip.mp4",
            )
            if self._on_success:
                self._on_success(result_job_id, final, output_filename)
            with self._lock:
                run.state = "succeeded"
                run.phase = "complete"
                run.result_job_id = result_job_id
                run.output_filename = output_filename
                run.output_sha256 = digest
                run.output_size_bytes = size
        except (LocalEditRuntimeError, EditContractError) as error:
            partial.unlink(missing_ok=True)
            final.unlink(missing_ok=True)
            with self._lock:
                if str(error) == "RUN_CANCELLED" or run.cancel_requested:
                    run.state = "cancelled"
                    run.phase = "cancelled"
                else:
                    run.state = "failed"
                    run.phase = "failed"
                    run.error_code = str(error) or "LOCAL_EDIT_FAILED"
        except Exception:
            partial.unlink(missing_ok=True)
            final.unlink(missing_ok=True)
            with self._lock:
                run.state = "failed"
                run.phase = "failed"
                run.error_code = "LOCAL_EDIT_FAILED"
        finally:
            with self._lock:
                run.process = None

    def status(self, run_id: str) -> dict:
        self._require_ready()
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise LocalEditRuntimeError("RUN_NOT_FOUND")
            return run.public()

    def cancel(self, run_id: str) -> dict:
        self._require_ready()
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise LocalEditRuntimeError("RUN_NOT_FOUND")
            if run.state in TERMINAL_STATES:
                return run.public()
            run.cancel_requested = True
            run.gate.cancel()
            if run.process and run.process.poll() is None:
                run.process.kill()
            run.state = "cancelled"
            run.phase = "cancelled"
            run.approval_token = None
            return run.public()

    def cleanup(self, before_epoch: float) -> None:
        with self._lock:
            protected_assets = {
                run.source.asset_id
                for run in self._runs.values()
                if run.state not in TERMINAL_STATES
            }
            stale_sources = [
                job_id for job_id, source in self._sources.items()
                if source.registered_at < before_epoch and source.asset_id not in protected_assets
            ]
            sources = [self._sources.pop(job_id) for job_id in stale_sources]
            stale_runs = [
                run_id for run_id, run in self._runs.items()
                if run.created_at < before_epoch and run.state in TERMINAL_STATES
            ]
            for run_id in stale_runs:
                self._runs.pop(run_id, None)
        for source in sources:
            source.path.unlink(missing_ok=True)
        for run_id in stale_runs:
            shutil.rmtree(self._run_root / run_id, ignore_errors=True)
