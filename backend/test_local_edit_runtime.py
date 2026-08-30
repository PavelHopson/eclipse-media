import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import unittest

from local_edit_contract import EditPlan
from local_edit_runtime import LocalEditRuntime, LocalEditRuntimeError


class LocalEditRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eclipse-media-edit-")
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_disabled_runtime_is_fail_closed(self):
        runtime = LocalEditRuntime(self.root, enabled=False)
        self.assertEqual(runtime.capability()["mode"], "preview-only")
        with self.assertRaisesRegex(LocalEditRuntimeError, "LOCAL_EDIT_DISABLED"):
            runtime.register_job("a" * 32, {})

    def test_registry_rejects_non_hex_incomplete_and_outside_paths(self):
        runtime = LocalEditRuntime(
            self.root,
            enabled=True,
            ffmpeg="ffmpeg",
            ffprobe="ffprobe",
        )
        outside = self.root.parent / "outside.mp4"
        outside.write_bytes(b"not media")
        self.addCleanup(outside.unlink, missing_ok=True)
        cases = [
            ("../source", {"status": "done", "file": str(outside)}),
            ("a" * 32, {"status": "downloading", "file": str(outside)}),
            ("a" * 32, {"status": "done", "file": str(outside)}),
        ]
        for job_id, job in cases:
            with self.subTest(job_id=job_id, status=job["status"]):
                with self.assertRaises(LocalEditRuntimeError):
                    runtime.register_job(job_id, job)

    def test_approved_run_can_be_cancelled_before_start(self):
        ffmpeg = shutil.which("ffmpeg")
        ffprobe = shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            self.skipTest("FFmpeg is unavailable")
        source = self._make_source(ffmpeg)
        runtime = LocalEditRuntime(
            self.root,
            enabled=True,
            ffmpeg=ffmpeg,
            ffprobe=ffprobe,
        )
        registered = runtime.register_job(
            "b" * 32,
            {"status": "done", "file": str(source), "filename": "source.mp4"},
        )
        plan_json = self._plan_json(registered, 0, 900)
        approval = runtime.approve(plan_json, rights_confirmed=True)
        cancelled = runtime.cancel(approval["runId"])
        self.assertEqual(cancelled["state"], "cancelled")
        with self.assertRaises(LocalEditRuntimeError):
            runtime.start(approval["runId"], approval["approvalToken"], plan_json)

    def test_real_mp4_smoke_uses_fixed_profile_and_one_time_approval(self):
        ffmpeg = shutil.which("ffmpeg")
        ffprobe = shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            self.skipTest("FFmpeg is unavailable")
        source = self._make_source(ffmpeg)
        source_before = source.read_bytes()
        completed = {}

        def on_success(job_id, path, filename):
            completed.update(job_id=job_id, path=path, filename=filename)

        runtime = LocalEditRuntime(
            self.root,
            enabled=True,
            on_success=on_success,
            ffmpeg=ffmpeg,
            ffprobe=ffprobe,
        )
        registered = runtime.register_job(
            "c" * 32,
            {"status": "done", "file": str(source), "filename": "release.mp4"},
        )
        self.assertNotIn(str(source), repr(runtime._sources["c" * 32]))
        plan_json = self._plan_json(registered, 250, 1250)
        approval = runtime.approve(plan_json, rights_confirmed=True)
        self.assertNotIn(approval["approvalToken"], repr(runtime._runs[approval["runId"]]))

        command = runtime._command(
            runtime._runs[approval["runId"]],
            self.root / "test.partial.mp4",
        )
        self.assertIn("file,pipe,crypto,data", command)
        self.assertFalse(any(re.search(r"https?://", item) for item in command))
        self.assertNotIn("-f", command)

        runtime.start(approval["runId"], approval["approvalToken"], plan_json)
        with self.assertRaisesRegex(LocalEditRuntimeError, "RUN_ALREADY_STARTED"):
            runtime.start(approval["runId"], approval["approvalToken"], plan_json)

        deadline = time.monotonic() + 45
        status = runtime.status(approval["runId"])
        while status["state"] not in {"succeeded", "failed", "cancelled"}:
            if time.monotonic() >= deadline:
                self.fail("Local edit smoke timed out")
            time.sleep(0.1)
            status = runtime.status(approval["runId"])

        self.assertEqual(status["state"], "succeeded", status)
        self.assertEqual(source.read_bytes(), source_before)
        self.assertRegex(status["result"]["jobId"], r"^[0-9a-f]{32}$")
        self.assertEqual(status["result"]["filename"], "release-clip.mp4")
        self.assertEqual(completed["job_id"], status["result"]["jobId"])
        self.assertTrue(completed["path"].is_file())
        self.assertNotIn("approvalToken", json.dumps(status))
        self.assertNotIn(str(source), json.dumps(status))

        probe = subprocess.run(
            [
                ffprobe, "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=codec_name,width,height",
                "-of", "json", str(completed["path"]),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        )
        stream = json.loads(probe.stdout)["streams"][0]
        self.assertEqual(
            (stream["codec_name"], stream["width"], stream["height"]),
            ("h264", 1280, 720),
        )

    def _make_source(self, ffmpeg: str) -> Path:
        source = self.root / "source.mp4"
        result = subprocess.run(
            [
                ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
                "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-y", str(source),
            ],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            self.skipTest("Local FFmpeg lacks the smoke-test codecs")
        return source

    @staticmethod
    def _plan_json(registered: dict, start_ms: int, end_ms: int) -> str:
        plan = EditPlan(
            registered["assetId"],
            registered["sha256"],
            start_ms,
            end_ms,
        )
        return json.dumps(plan.as_dict(), separators=(",", ":"))


if __name__ == "__main__":
    unittest.main()
