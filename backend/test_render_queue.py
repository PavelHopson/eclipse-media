import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from render_queue_contract import RenderContractError, parse_render_request
from render_queue_runtime import RenderQueueError, RenderQueueRuntime


def request_bytes(*, title="Сигнал релиза", format_value="16:9"):
    scene_ids = ["signal", "inputs", "pipeline", "quality", "close"]
    return json.dumps({
        "schemaVersion": "eclipse.release-render-request.v1",
        "variables": {
            "schemaVersion": "eclipse.release-variables.v1",
            "sourceBriefSchemaVersion": "eclipse.release-brief.v1",
            "templateId": "eclipse-release-signal",
            "title": title,
            "format": format_value,
            "duration": 15,
            "renderRequiresApproval": True,
            "publishRequiresApproval": True,
            "execution": {"network": False, "shell": False, "render": False, "publish": False},
            "scenes": [
                {
                    "id": scene_id,
                    "start": index * 3,
                    "duration": 3,
                    "eyebrow": f"Сцена {index + 1}",
                    "headline": f"Проверенный заголовок {index + 1}",
                    "body": f"Проверенное описание сцены {index + 1}",
                }
                for index, scene_id in enumerate(scene_ids)
            ],
        },
        "review": {"claimsReviewed": True, "noSensitiveData": True, "previewReviewed": True},
    }, ensure_ascii=False).encode("utf-8")


class BlockingRenderQueue(RenderQueueRuntime):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.started = threading.Event()
        self.release = threading.Event()

    def _execute_job(self, job_id):
        with self._lock:
            job = self._jobs[job_id]
            job["phase"] = "rendering"
        self.started.set()
        while not self.release.wait(0.01):
            if job["cancel"].is_set():
                with self._lock:
                    self._finish_locked(job, "cancelled", "cancelled", None)
                    self._audit_event("job_cancelled", job=job)
                return
        output = self.workspace / "queue" / "jobs" / job_id / "output.mp4"
        output.write_bytes(b"\x00\x00\x00\x18ftypmp42safe-render")
        with self._lock:
            self._verify_output_locked(job)


class RenderQueueContractTests(unittest.TestCase):
    def test_accepts_only_fixed_copy_timeline_and_format(self):
        request = parse_render_request(request_bytes(format_value="9:16"))
        self.assertEqual(request.format_slug, "vertical")
        self.assertEqual(len(request.variables["scenes"]), 5)
        self.assertNotIn("path", request.canonical_json)
        self.assertNotIn("command", request.canonical_json)

    def test_rejects_unknown_fields_duplicates_secrets_and_execution_changes(self):
        unknown = json.loads(request_bytes())
        unknown["variables"]["command"] = "render --publish"
        secret = json.loads(request_bytes())
        secret["variables"]["scenes"][0]["body"] = "api_key=" + "A" * 24
        unsafe = json.loads(request_bytes())
        unsafe["variables"]["execution"]["shell"] = True
        linked = json.loads(request_bytes())
        linked["variables"]["scenes"][0]["body"] = "Откройте https://example.com"
        cases = [
            json.dumps(unknown).encode(),
            b'{"schemaVersion":"a","schemaVersion":"b"}',
            json.dumps(secret).encode(),
            json.dumps(unsafe).encode(),
            json.dumps(linked).encode(),
        ]
        for raw in cases:
            with self.subTest(raw=raw[:40]), self.assertRaises(RenderContractError):
                parse_render_request(raw)


class RenderQueueRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eclipse-render-queue-")
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "scripts" / "render-queued-job.mjs").write_text("// fixed runner", encoding="utf-8")
        (self.root / "package.json").write_text(
            json.dumps({"hyperframes": {"version": "0.7.88"}}), encoding="utf-8"
        )
        package = self.root / "node_modules" / "hyperframes"
        package.mkdir(parents=True)
        (package / "package.json").write_text(
            json.dumps({"name": "hyperframes", "version": "0.7.88"}), encoding="utf-8"
        )
        self.node = self.root / "node.exe"
        self.node.write_bytes(b"trusted test executable")
        self.runtime = BlockingRenderQueue(enabled=True, workspace=self.root, node=self.node)

    def tearDown(self):
        self.runtime.release.set()
        self.runtime.close()
        self.temp.cleanup()

    def approve_and_submit(self, request):
        approval = self.runtime.approve(request)
        return self.runtime.submit(request, approval["approvalToken"])

    def test_one_running_two_waiting_and_fourth_is_rejected(self):
        request = parse_render_request(request_bytes())
        first = self.approve_and_submit(request)
        self.assertTrue(self.runtime.started.wait(1))
        second = self.approve_and_submit(request)
        third = self.approve_and_submit(request)
        approval = self.runtime.approve(request)
        with self.assertRaisesRegex(RenderQueueError, "QUEUE_FULL"):
            self.runtime.submit(request, approval["approvalToken"])
        self.assertEqual(first["state"], "queued")
        self.assertEqual(second["state"], "queued")
        self.assertEqual(third["state"], "queued")
        self.assertEqual(sum(job["state"] in ("queued", "running") for job in self.runtime.list_jobs()), 3)

    def test_approval_is_one_time_and_bound_to_exact_request(self):
        request = parse_render_request(request_bytes())
        changed = parse_render_request(request_bytes(title="Другой релиз"))
        approval = self.runtime.approve(request)
        with self.assertRaisesRegex(RenderQueueError, "APPROVAL_MISMATCH"):
            self.runtime.submit(changed, approval["approvalToken"])
        with self.assertRaisesRegex(RenderQueueError, "INVALID_APPROVAL"):
            self.runtime.submit(request, approval["approvalToken"])

    def test_cancel_and_redacted_audit_never_expose_copy_paths_or_tokens(self):
        request = parse_render_request(request_bytes(title="Сверхсекретный внутренний релиз"))
        approval = self.runtime.approve(request)
        token = approval["approvalToken"]
        job = self.runtime.submit(request, token)
        self.assertTrue(self.runtime.started.wait(1))
        cancelled = self.runtime.cancel(job["jobId"])
        for _ in range(100):
            cancelled = self.runtime.get(job["jobId"])
            if cancelled["state"] == "cancelled":
                break
            time.sleep(0.01)
        self.assertEqual(cancelled["state"], "cancelled")
        serialized = json.dumps(self.runtime.audit(), ensure_ascii=False)
        self.assertNotIn("Сверхсекретный", serialized)
        self.assertNotIn(str(self.root), serialized)
        self.assertNotIn(token, serialized)


if __name__ == "__main__":
    unittest.main()
