"""Fail-closed MiniMax Music 3 benchmark planner for Eclipse Media.

Dry-run is the default. Execution is allowed only against an isolated loopback
runner and never downloads model code or sends prompts to a third-party API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

SCHEMA_VERSION = "eclipse.media.music-benchmark.v1"
RESULT_SCHEMA_VERSION = "eclipse.media.music-benchmark.result.v1"
MODEL_ID = "MiniMaxAI/MiniMax-Music3"
PINNED_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}
MAX_CASES = 12
MAX_RESPONSE_BYTES = 1_048_576
MAX_PROMPT_LENGTH = 1_200
ALLOWED_RESULT_FIELDS = {
    "status",
    "assetSha256",
    "durationSeconds",
    "sampleRate",
    "metrics",
}
ALLOWED_METRICS = {
    "promptAdherence",
    "audioQuality",
    "structure",
    "vocalClarity",
    "artifactScore",
}


class BenchmarkPolicyError(ValueError):
    """Raised when a benchmark request crosses a safety or reproducibility gate."""


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep the bearer token inside the validated loopback trust boundary."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise BenchmarkPolicyError("Runner redirects are forbidden")


@dataclass(frozen=True)
class ExecutionApproval:
    license_accepted: bool
    rights_confirmed: bool
    no_sensitive_input: bool
    no_voice_impersonation: bool

    def validate(self) -> None:
        missing = [
            name
            for name, allowed in (
                ("license_accepted", self.license_accepted),
                ("rights_confirmed", self.rights_confirmed),
                ("no_sensitive_input", self.no_sensitive_input),
                ("no_voice_impersonation", self.no_voice_impersonation),
            )
            if not allowed
        ]
        if missing:
            raise BenchmarkPolicyError("Execution approval is incomplete: " + ", ".join(missing))


def validate_runner_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
        raise BenchmarkPolicyError("Runner must use plain HTTP on an explicit loopback host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise BenchmarkPolicyError("Runner URL cannot contain credentials, query or fragment")
    if parsed.path.rstrip("/") != "/v1/music/generate":
        raise BenchmarkPolicyError("Runner path must be exactly /v1/music/generate")
    if parsed.port is None:
        raise BenchmarkPolicyError("Runner URL must include an explicit port")
    return value.strip()


def validate_revision(value: str) -> str:
    revision = value.strip().lower()
    if not PINNED_REVISION_RE.fullmatch(revision):
        raise BenchmarkPolicyError("Model revision must be a pinned 40-character commit SHA")
    return revision


def load_cases(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise BenchmarkPolicyError("Unsupported benchmark schemaVersion")
    cases = raw.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise BenchmarkPolicyError(f"Benchmark must contain 1 to {MAX_CASES} cases")

    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    allowed_fields = {"id", "title", "prompt", "durationSeconds", "language", "mode"}
    for case in cases:
        if not isinstance(case, dict) or set(case) - allowed_fields:
            raise BenchmarkPolicyError("Case contains unsupported fields")
        case_id = case.get("id")
        prompt = case.get("prompt")
        duration = case.get("durationSeconds")
        mode = case.get("mode")
        if not isinstance(case_id, str) or not re.fullmatch(r"[a-z0-9-]{3,64}", case_id):
            raise BenchmarkPolicyError("Case id must be a stable lowercase identifier")
        if case_id in seen:
            raise BenchmarkPolicyError("Case ids must be unique")
        if not isinstance(prompt, str) or not 20 <= len(prompt) <= MAX_PROMPT_LENGTH:
            raise BenchmarkPolicyError("Case prompt length is outside the safe benchmark boundary")
        if not isinstance(duration, int) or not 10 <= duration <= 90:
            raise BenchmarkPolicyError("Case duration must be between 10 and 90 seconds")
        if mode not in {"instrumental", "original-vocal"}:
            raise BenchmarkPolicyError("Case mode must be instrumental or original-vocal")
        seen.add(case_id)
        validated.append(case)
    return validated


def build_plan(cases: list[dict[str, Any]], revision: str) -> dict[str, Any]:
    canonical = json.dumps(cases, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "model": {"id": MODEL_ID, "revision": revision},
        "caseCount": len(cases),
        "caseSetSha256": hashlib.sha256(canonical).hexdigest(),
        "execution": {
            "default": "dry-run",
            "network": "loopback runner only",
            "downloadsModelCode": False,
            "storesRawAudio": False,
            "requiresHumanApproval": True,
        },
        "cases": cases,
    }


def _validate_result(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) - ALLOWED_RESULT_FIELDS:
        raise BenchmarkPolicyError("Runner returned unsupported result fields")
    if payload.get("status") != "completed":
        raise BenchmarkPolicyError("Runner did not return a completed result")
    if not isinstance(payload.get("assetSha256"), str) or not SHA256_RE.fullmatch(payload["assetSha256"]):
        raise BenchmarkPolicyError("Runner result requires an asset SHA-256")
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict) or not metrics or set(metrics) - ALLOWED_METRICS:
        raise BenchmarkPolicyError("Runner returned unsupported metrics")
    for value in metrics.values():
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
            raise BenchmarkPolicyError("Runner metrics must be numbers between 0 and 1")
    duration = payload.get("durationSeconds")
    if duration is not None and (
        not isinstance(duration, (int, float))
        or isinstance(duration, bool)
        or not 1 <= duration <= 600
    ):
        raise BenchmarkPolicyError("Runner durationSeconds must be between 1 and 600")
    sample_rate = payload.get("sampleRate")
    if sample_rate is not None and (
        not isinstance(sample_rate, int)
        or isinstance(sample_rate, bool)
        or not 8_000 <= sample_rate <= 192_000
    ):
        raise BenchmarkPolicyError("Runner sampleRate must be between 8000 and 192000")
    return payload


def _open_runner_request(request: urllib.request.Request):
    opener = urllib.request.build_opener(_NoRedirectHandler())
    return opener.open(request, timeout=120)


def _parse_content_length(value: str | None) -> int:
    try:
        declared = int(value or "0")
    except ValueError as error:
        raise BenchmarkPolicyError("Runner returned an invalid Content-Length") from error
    if declared < 0:
        raise BenchmarkPolicyError("Runner returned an invalid Content-Length")
    return declared


def execute_plan(
    plan: dict[str, Any],
    runner_url: str,
    approval: ExecutionApproval,
    token: str | None,
) -> dict[str, Any]:
    approval.validate()
    endpoint = validate_runner_url(runner_url)
    results: list[dict[str, Any]] = []
    for case in plan["cases"]:
        request_body = json.dumps(
            {
                "schemaVersion": SCHEMA_VERSION,
                "model": plan["model"],
                "case": case,
                "output": {"returnRawAudio": False},
            },
            ensure_ascii=False,
        ).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Eclipse-Benchmark": "minimax-music3",
        }
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(endpoint, data=request_body, headers=headers, method="POST")
        try:
            with _open_runner_request(request) as response:
                declared = _parse_content_length(response.headers.get("Content-Length"))
                if declared > MAX_RESPONSE_BYTES:
                    raise BenchmarkPolicyError("Runner response exceeds the 1 MiB limit")
                raw = response.read(MAX_RESPONSE_BYTES + 1)
        except (urllib.error.URLError, TimeoutError) as error:
            raise BenchmarkPolicyError("Isolated benchmark runner is unavailable") from error
        if len(raw) > MAX_RESPONSE_BYTES:
            raise BenchmarkPolicyError("Runner response exceeds the 1 MiB limit")
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BenchmarkPolicyError("Runner returned invalid JSON") from error
        results.append({"caseId": case["id"], **_validate_result(payload)})
    return {
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "model": plan["model"],
        "caseSetSha256": plan["caseSetSha256"],
        "results": results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plan or run a fail-closed MiniMax Music 3 benchmark")
    parser.add_argument("--cases", type=Path, default=Path(__file__).with_name("minimax_music3_cases.json"))
    parser.add_argument("--revision", required=True, help="Pinned 40-character Hugging Face commit SHA")
    parser.add_argument("--execute", action="store_true", help="Use an isolated loopback runner")
    parser.add_argument("--runner-url", default="http://127.0.0.1:8098/v1/music/generate")
    parser.add_argument("--accept-license", action="store_true")
    parser.add_argument("--confirm-rights", action="store_true")
    parser.add_argument("--confirm-no-sensitive-input", action="store_true")
    parser.add_argument("--confirm-no-voice-impersonation", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    revision = validate_revision(args.revision)
    plan = build_plan(load_cases(args.cases), revision)
    if not args.execute:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    approval = ExecutionApproval(
        license_accepted=args.accept_license,
        rights_confirmed=args.confirm_rights,
        no_sensitive_input=args.confirm_no_sensitive_input,
        no_voice_impersonation=args.confirm_no_voice_impersonation,
    )
    result = execute_plan(
        plan,
        args.runner_url,
        approval,
        os.environ.get("ECLIPSE_MEDIA_BENCHMARK_TOKEN"),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())