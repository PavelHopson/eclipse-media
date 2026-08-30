"""Bounded, local-only worker for the fixed Eclipse release composition."""

from collections import deque
from hashlib import sha256
from hmac import compare_digest
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import threading
import time
import uuid

from render_queue_contract import ReleaseRenderRequest


MAX_RUNNING = 1
MAX_QUEUED = 2
TIMEOUT_SECONDS = 20 * 60
MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024
MAX_OUTPUT_BYTES = 512 * 1024 * 1024
APPROVAL_TTL_SECONDS = 120
JOB_TTL_SECONDS = 60 * 60
AUDIT_LIMIT = 100
MAX_APPROVALS = 16


class RenderQueueError(ValueError):
    """Fixed error code only; never echo paths, tokens, copy or process output."""


class RenderQueueRuntime:
    def __init__(self, *, enabled=False, workspace=None, node=None, clock=time.time):
        self.enabled = enabled is True
        self.workspace = Path(workspace).resolve() if workspace else None
        self.node = Path(node).resolve() if node else None
        self.clock = clock
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._jobs = {}
        self._queue = deque()
        self._approvals = {}
        self._audit = deque(maxlen=AUDIT_LIMIT)
        self._worker = None
        self._closed = False

    @classmethod
    def from_environment(cls):
        enabled = os.environ.get("ECLIPSE_MEDIA_RENDER_QUEUE_ENABLED", "").lower() == "true"
        return cls(
            enabled=enabled,
            workspace=os.environ.get("ECLIPSE_MEDIA_RENDER_WORKSPACE"),
            node=os.environ.get("ECLIPSE_MEDIA_RENDER_NODE"),
        )

    def capability(self):
        self._cleanup_orphan_dirs()
        reason = self._configuration_error()
        return {
            "enabled": self.enabled,
            "ready": reason is None,
            "mode": "local-queue" if reason is None else "preview-only",
            "reason": reason,
            "limits": {
                "maxRunning": MAX_RUNNING,
                "maxQueued": MAX_QUEUED,
                "timeoutSeconds": TIMEOUT_SECONDS,
                "minFreeBytes": MIN_FREE_BYTES,
                "maxOutputBytes": MAX_OUTPUT_BYTES,
            },
        }

    def _configuration_error(self):
        if not self.enabled:
            return "RENDER_QUEUE_DISABLED"
        if not self.workspace or not self.node:
            return "RENDER_RUNTIME_UNAVAILABLE"
        try:
            if not self.workspace.is_dir() or not self.node.is_file():
                return "RENDER_RUNTIME_UNAVAILABLE"
            runner = (self.workspace / "scripts" / "render-queued-job.mjs").resolve()
            manifest_file = (self.workspace / "package.json").resolve()
            package_file = (self.workspace / "node_modules" / "hyperframes" / "package.json").resolve()
            if not self._inside(runner, self.workspace) or not runner.is_file():
                return "RENDER_RUNTIME_UNAVAILABLE"
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            package = json.loads(package_file.read_text(encoding="utf-8"))
            if (manifest.get("hyperframes", {}).get("version") != "0.7.88"
                    or package.get("name") != "hyperframes" or package.get("version") != "0.7.88"):
                return "RENDER_RUNTIME_MISMATCH"
            if shutil.disk_usage(self.workspace).free < MIN_FREE_BYTES:
                return "DISK_LIMIT_REACHED"
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return "RENDER_RUNTIME_UNAVAILABLE"
        return None

    @staticmethod
    def _inside(path, root):
        try:
            path.relative_to(root)
            return True
        except ValueError:
            return False

    def approve(self, request):
        self._assert_ready()
        if type(request) is not ReleaseRenderRequest:
            raise RenderQueueError("INVALID_REQUEST")
        with self._lock:
            self._cleanup_locked()
            if len(self._approvals) >= MAX_APPROVALS:
                raise RenderQueueError("APPROVAL_LIMIT_REACHED")
            token = secrets.token_urlsafe(32)
            self._approvals[token] = {
                "digest": request.digest,
                "expires": self.clock() + APPROVAL_TTL_SECONDS,
            }
            self._audit_event("approval_created", format_slug=request.format_slug)
        return {"approvalToken": token, "expiresInSeconds": APPROVAL_TTL_SECONDS, "requestDigest": request.digest}

    def submit(self, request, approval_token):
        self._assert_ready()
        if type(request) is not ReleaseRenderRequest or type(approval_token) is not str:
            raise RenderQueueError("INVALID_APPROVAL")
        with self._condition:
            self._cleanup_locked()
            approval = self._approvals.pop(approval_token, None)
            if approval is None:
                raise RenderQueueError("INVALID_APPROVAL")
            if self.clock() >= approval["expires"]:
                raise RenderQueueError("EXPIRED_APPROVAL")
            if not compare_digest(request.digest, approval["digest"]):
                raise RenderQueueError("APPROVAL_MISMATCH")
            active = [job for job in self._jobs.values() if job["state"] in ("queued", "running")]
            if len(active) >= MAX_RUNNING + MAX_QUEUED:
                raise RenderQueueError("QUEUE_FULL")
            if shutil.disk_usage(self.workspace).free < MIN_FREE_BYTES:
                raise RenderQueueError("DISK_LIMIT_REACHED")

            job_id = uuid.uuid4().hex
            created = int(self.clock() * 1000)
            job_dir = self.workspace / "queue" / "jobs" / job_id
            job_dir.mkdir(parents=True, exist_ok=False)
            variables_file = job_dir / "variables.json"
            temporary = job_dir / ".variables.tmp"
            temporary.write_text(
                json.dumps(request.variables, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            temporary.replace(variables_file)
            job = {
                "jobId": job_id,
                "state": "queued",
                "phase": "waiting",
                "format": request.variables["format"],
                "formatSlug": request.format_slug,
                "createdAt": created,
                "updatedAt": created,
                "requestDigest": request.digest,
                "errorCode": None,
                "result": None,
                "process": None,
                "cancel": threading.Event(),
            }
            self._jobs[job_id] = job
            self._queue.append(job_id)
            self._audit_event("job_queued", job=job)
            self._ensure_worker_locked()
            self._condition.notify_all()
            return self._public_job(job)

    def list_jobs(self):
        with self._lock:
            self._cleanup_locked()
            return [self._public_job(job) for job in sorted(self._jobs.values(), key=lambda item: item["createdAt"], reverse=True)[:20]]

    def get(self, job_id):
        if re.fullmatch(r"[0-9a-f]{32}", job_id or "") is None:
            raise RenderQueueError("JOB_NOT_FOUND")
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise RenderQueueError("JOB_NOT_FOUND")
            return self._public_job(job)

    def result_path(self, job_id):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job["state"] != "succeeded" or not job["result"]:
                raise RenderQueueError("RESULT_NOT_READY")
            path = (self.workspace / "queue" / "jobs" / job_id / "output.mp4").resolve()
            root = (self.workspace / "queue" / "jobs" / job_id).resolve()
            if not self._inside(path, root) or path.is_symlink() or not path.is_file():
                raise RenderQueueError("OUTPUT_INVALID")
            return path, job["result"]["filename"]

    def cancel(self, job_id):
        with self._condition:
            job = self._jobs.get(job_id)
            if not job:
                raise RenderQueueError("JOB_NOT_FOUND")
            if job["state"] not in ("queued", "running"):
                return self._public_job(job)
            job["cancel"].set()
            if job["state"] == "queued":
                try:
                    self._queue.remove(job_id)
                except ValueError:
                    pass
                self._finish_locked(job, "cancelled", "cancelled", None)
                self._audit_event("job_cancelled", job=job)
            process = job.get("process")
            self._condition.notify_all()
        if process and process.poll() is None:
            self._terminate_process(process)
        return self.get(job_id)

    def audit(self):
        with self._lock:
            return list(reversed(self._audit))

    def close(self):
        with self._condition:
            self._closed = True
            worker = self._worker
            running = [job for job in self._jobs.values() if job["state"] == "running"]
            for job in running:
                job["cancel"].set()
            self._condition.notify_all()
        for job in running:
            process = job.get("process")
            if process and process.poll() is None:
                self._terminate_process(process)
        if worker and worker is not threading.current_thread():
            worker.join(timeout=10)

    def _assert_ready(self):
        reason = self._configuration_error()
        if reason:
            raise RenderQueueError(reason)

    def _ensure_worker_locked(self):
        if self._worker is None or not self._worker.is_alive():
            self._worker = threading.Thread(target=self._worker_loop, name="eclipse-render-queue", daemon=True)
            self._worker.start()

    def _worker_loop(self):
        while True:
            with self._condition:
                while not self._queue and not self._closed:
                    self._condition.wait()
                if self._closed:
                    return
                job_id = self._queue.popleft()
                job = self._jobs.get(job_id)
                if not job or job["state"] != "queued":
                    continue
                job["state"] = "running"
                job["phase"] = "validating"
                job["updatedAt"] = int(self.clock() * 1000)
                self._audit_event("job_started", job=job)
            self._execute_job(job_id)

    def _execute_job(self, job_id):
        with self._lock:
            job = self._jobs[job_id]
            if job["cancel"].is_set():
                self._finish_locked(job, "cancelled", "cancelled", None)
                return
            job["phase"] = "rendering"
            job["updatedAt"] = int(self.clock() * 1000)
        runner = self.workspace / "scripts" / "render-queued-job.mjs"
        command = [str(self.node), str(runner), job_id, job["formatSlug"]]
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "NO_PROXY": "*",
            "no_proxy": "*",
            "ECLIPSE_MEDIA_RENDER_QUEUE": "1",
        }
        for key in ("SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA"):
            if os.environ.get(key):
                environment[key] = os.environ[key]
        flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        try:
            process = subprocess.Popen(
                command,
                cwd=self.workspace,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
                creationflags=flags,
                start_new_session=os.name != "nt",
            )
            with self._lock:
                job["process"] = process
            deadline = time.monotonic() + TIMEOUT_SECONDS
            timed_out = False
            output_limited = False
            output_path = self.workspace / "queue" / "jobs" / job_id / "output.mp4"
            while process.poll() is None:
                if job["cancel"].wait(0.25):
                    self._terminate_process(process)
                    break
                if time.monotonic() >= deadline:
                    timed_out = True
                    self._terminate_process(process)
                    break
                try:
                    if output_path.is_file() and output_path.stat().st_size > MAX_OUTPUT_BYTES:
                        output_limited = True
                        self._terminate_process(process)
                        break
                except OSError:
                    output_limited = True
                    self._terminate_process(process)
                    break
            process.wait(timeout=10)
            with self._lock:
                job["process"] = None
                if job["cancel"].is_set():
                    self._finish_locked(job, "cancelled", "cancelled", None)
                    self._audit_event("job_cancelled", job=job)
                    self._remove_failed_output(job_id)
                    return
                if timed_out:
                    self._finish_locked(job, "failed", "failed", "WORKER_TIMEOUT")
                    self._audit_event("job_failed", job=job)
                    self._remove_failed_output(job_id)
                    return
                if output_limited:
                    self._finish_locked(job, "failed", "failed", "OUTPUT_LIMIT_EXCEEDED")
                    self._audit_event("job_failed", job=job)
                    self._remove_failed_output(job_id)
                    return
                if process.returncode != 0:
                    self._finish_locked(job, "failed", "failed", "RENDER_FAILED")
                    self._audit_event("job_failed", job=job)
                    self._remove_failed_output(job_id)
                    return
                self._verify_output_locked(job)
        except (OSError, subprocess.SubprocessError):
            with self._lock:
                self._finish_locked(job, "failed", "failed", "RENDER_FAILED")
                self._audit_event("job_failed", job=job)
                self._remove_failed_output(job_id)

    def _verify_output_locked(self, job):
        job["phase"] = "verifying"
        job_id = job["jobId"]
        root = (self.workspace / "queue" / "jobs" / job_id).resolve()
        output = (root / "output.mp4").resolve()
        if not self._inside(output, root) or output.is_symlink() or not output.is_file():
            self._finish_locked(job, "failed", "failed", "OUTPUT_INVALID")
            self._audit_event("job_failed", job=job)
            return
        size = output.stat().st_size
        if size < 12 or size > MAX_OUTPUT_BYTES:
            self._finish_locked(job, "failed", "failed", "OUTPUT_LIMIT_EXCEEDED")
            self._audit_event("job_failed", job=job)
            self._remove_failed_output(job_id)
            return
        with output.open("rb") as stream:
            header = stream.read(12)
            digest = sha256()
            stream.seek(0)
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if b"ftyp" not in header:
            self._finish_locked(job, "failed", "failed", "OUTPUT_INVALID")
            self._audit_event("job_failed", job=job)
            self._remove_failed_output(job_id)
            return
        job["result"] = {
            "filename": f"eclipse-release-{job['formatSlug']}-{job_id[:8]}.mp4",
            "sha256": digest.hexdigest(),
            "sizeBytes": size,
        }
        self._finish_locked(job, "succeeded", "complete", None)
        self._audit_event("job_succeeded", job=job, result_bytes=size)

    def _finish_locked(self, job, state, phase, error):
        job["state"] = state
        job["phase"] = phase
        job["errorCode"] = error
        job["updatedAt"] = int(self.clock() * 1000)
        job["process"] = None

    def _remove_failed_output(self, job_id):
        try:
            (self.workspace / "queue" / "jobs" / job_id / "output.mp4").unlink(missing_ok=True)
        except OSError:
            pass

    def _terminate_process(self, process):
        if process.poll() is not None:
            return
        try:
            if os.name == "nt":
                taskkill = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "taskkill.exe"
                subprocess.run(
                    [str(taskkill), "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                    shell=False,
                )
            else:
                os.killpg(process.pid, 15)
        except (OSError, subprocess.SubprocessError):
            try:
                process.kill()
            except OSError:
                pass

    def _cleanup_locked(self):
        now = self.clock()
        self._approvals = {token: item for token, item in self._approvals.items() if item["expires"] > now}
        expired = [
            job_id for job_id, job in self._jobs.items()
            if job["state"] not in ("queued", "running") and job["updatedAt"] < int((now - JOB_TTL_SECONDS) * 1000)
        ]
        for job_id in expired:
            self._jobs.pop(job_id, None)
            try:
                shutil.rmtree(self.workspace / "queue" / "jobs" / job_id)
            except OSError:
                pass

    def _cleanup_orphan_dirs(self):
        if not self.workspace:
            return
        jobs_root = self.workspace / "queue" / "jobs"
        try:
            real_root = jobs_root.resolve()
            if not jobs_root.is_dir():
                return
            threshold = self.clock() - JOB_TTL_SECONDS
            for candidate in jobs_root.iterdir():
                if (candidate.is_symlink() or not candidate.is_dir()
                        or re.fullmatch(r"[0-9a-f]{32}", candidate.name) is None
                        or candidate.stat().st_mtime >= threshold):
                    continue
                resolved = candidate.resolve()
                if self._inside(resolved, real_root):
                    shutil.rmtree(resolved)
        except OSError:
            return

    def _audit_event(self, event, *, job=None, format_slug=None, result_bytes=None):
        self._audit.append({
            "timestamp": int(self.clock() * 1000),
            "event": event,
            "jobId": job["jobId"] if job else None,
            "format": job["format"] if job else format_slug,
            "state": job["state"] if job else None,
            "errorCode": job.get("errorCode") if job else None,
            "resultBytes": result_bytes,
        })

    @staticmethod
    def _public_job(job):
        return {
            "jobId": job["jobId"],
            "state": job["state"],
            "phase": job["phase"],
            "format": job["format"],
            "createdAt": job["createdAt"],
            "updatedAt": job["updatedAt"],
            "requestDigest": job["requestDigest"],
            "errorCode": job.get("errorCode"),
            "result": dict(job["result"]) if job.get("result") else None,
        }
