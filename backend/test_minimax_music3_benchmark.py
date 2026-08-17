import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from minimax_music3_benchmark import (
    BenchmarkPolicyError,
    ExecutionApproval,
    _NoRedirectHandler,
    _validate_result,
    build_plan,
    execute_plan,
    load_cases,
    validate_revision,
    validate_runner_url,
)


REVISION = "a" * 40


class MusicBenchmarkPolicyTests(unittest.TestCase):
    def setUp(self):
        self.cases = load_cases(Path(__file__).with_name("minimax_music3_cases.json"))
        self.plan = build_plan(self.cases, REVISION)

    def test_default_plan_is_local_dry_run_without_raw_audio(self):
        self.assertEqual(self.plan["execution"]["default"], "dry-run")
        self.assertFalse(self.plan["execution"]["downloadsModelCode"])
        self.assertFalse(self.plan["execution"]["storesRawAudio"])
        self.assertEqual(self.plan["caseCount"], 3)

    def test_requires_pinned_commit_revision(self):
        self.assertEqual(validate_revision(REVISION), REVISION)
        for value in ("main", "v1.0.0", "a" * 39, "z" * 40):
            with self.subTest(value=value), self.assertRaises(BenchmarkPolicyError):
                validate_revision(value)

    def test_runner_is_loopback_only_with_exact_path(self):
        self.assertEqual(
            validate_runner_url("http://127.0.0.1:8098/v1/music/generate"),
            "http://127.0.0.1:8098/v1/music/generate",
        )
        for value in (
            "https://example.com/v1/music/generate",
            "http://10.0.0.5:8098/v1/music/generate",
            "http://localhost:8098/other",
            "http://user:secret@localhost:8098/v1/music/generate",
        ):
            with self.subTest(value=value), self.assertRaises(BenchmarkPolicyError):
                validate_runner_url(value)

    def test_execution_requires_all_human_gates_before_network(self):
        with patch("minimax_music3_benchmark._open_runner_request") as open_request:
            with self.assertRaises(BenchmarkPolicyError):
                execute_plan(
                    self.plan,
                    "http://127.0.0.1:8098/v1/music/generate",
                    ExecutionApproval(
                        license_accepted=True,
                        rights_confirmed=True,
                        no_sensitive_input=True,
                        no_voice_impersonation=False,
                    ),
                    None,
                )
            open_request.assert_not_called()

    def test_redirects_are_forbidden(self):
        handler = _NoRedirectHandler()
        with self.assertRaisesRegex(BenchmarkPolicyError, "redirects are forbidden"):
            handler.redirect_request(None, None, 302, "Found", {}, "https://example.com")

    def test_result_metrics_and_media_metadata_are_bounded(self):
        valid = {
            "status": "completed",
            "assetSha256": "b" * 64,
            "durationSeconds": 30.5,
            "sampleRate": 48_000,
            "metrics": {"audioQuality": 0.8},
        }
        self.assertEqual(_validate_result(valid), valid)
        for invalid in (
            {**valid, "metrics": {}},
            {**valid, "durationSeconds": 601},
            {**valid, "sampleRate": 7_999},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(BenchmarkPolicyError):
                _validate_result(invalid)

    def test_rejects_unknown_case_fields(self):
        invalid = {
            "schemaVersion": "eclipse.media.music-benchmark.v1",
            "cases": [
                {
                    **self.cases[0],
                    "downloadUrl": "https://untrusted.example/model",
                }
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.json"
            path.write_text(json.dumps(invalid), encoding="utf-8")
            with self.assertRaises(BenchmarkPolicyError):
                load_cases(path)


if __name__ == "__main__":
    unittest.main()