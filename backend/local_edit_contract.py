"""Offline local-edit contract. No file access, FFmpeg, network, or HTTP routes.

Only a trusted host may construct scopes/source snapshots and issue approvals.
This is not an OS sandbox or an identity/rights verification service.
"""

from dataclasses import dataclass, field
from hashlib import sha256
from hmac import compare_digest
import json
import math
import re
import secrets
from threading import Lock
import time
from uuid import UUID


SCHEMA = "eclipse.local-edit-plan.v1"
PROFILE = "mp4-h264-aac-720p-v1"
MAX_PLAN_BYTES = 16 * 1024
MAX_SOURCE_BYTES = 256 * 1024 * 1024
MAX_SOURCE_MS = 5 * 60 * 1000
MAX_CLIP_MS = 60 * 1000
APPROVAL_TTL_SECONDS = 120


class EditContractError(ValueError):
    """Fixed error code only; never echo a path, plan, token or transcript."""


def _uuid(value):
    if type(value) is not str or len(value) != 36:
        raise EditContractError("INVALID_ID")
    try:
        valid = str(UUID(value)) == value
    except ValueError:
        valid = False
    if not valid:
        raise EditContractError("INVALID_ID")
    return value


def _hash(value):
    if type(value) is not str or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise EditContractError("INVALID_SOURCE_HASH")
    return value


def _integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise EditContractError("INVALID_LIMIT")
    return value


def _object(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise EditContractError("INVALID_SCHEMA")
    return value


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise EditContractError("DUPLICATE_FIELD")
        result[key] = value
    return result


def _constant(_value):
    raise EditContractError("INVALID_JSON")


@dataclass(frozen=True)
class RunScope:
    workspace_id: str
    user_id: str
    employee_id: str
    run_id: str
    capability_revision: int

    def __post_init__(self):
        for value in (self.workspace_id, self.user_id, self.employee_id, self.run_id):
            _uuid(value)
        _integer(self.capability_revision, 1, 2**31 - 1)


@dataclass(frozen=True)
class SourceSnapshot:
    asset_id: str
    workspace_id: str
    owner_id: str
    sha256: str
    size_bytes: int
    duration_ms: int
    media_type: str = "video/mp4"

    def __post_init__(self):
        for value in (self.asset_id, self.workspace_id, self.owner_id):
            _uuid(value)
        _hash(self.sha256)
        _integer(self.size_bytes, 1, MAX_SOURCE_BYTES)
        _integer(self.duration_ms, 1, MAX_SOURCE_MS)
        if self.media_type != "video/mp4":
            raise EditContractError("UNSUPPORTED_SOURCE")


@dataclass(frozen=True)
class EditPlan:
    asset_id: str
    source_sha256: str
    start_ms: int
    end_ms: int

    def __post_init__(self):
        _uuid(self.asset_id)
        _hash(self.source_sha256)
        _integer(self.start_ms, 0, MAX_SOURCE_MS)
        _integer(self.end_ms, 1, MAX_SOURCE_MS)
        if not 0 < self.end_ms - self.start_ms <= MAX_CLIP_MS:
            raise EditContractError("INVALID_TRIM")

    def as_dict(self):
        return {"schemaVersion": SCHEMA,
                "source": {"assetId": self.asset_id, "sha256": self.source_sha256},
                "trim": {"startMs": self.start_ms, "endMs": self.end_ms},
                "outputProfile": PROFILE}

    @property
    def digest(self):
        canonical = json.dumps(self.as_dict(), sort_keys=True, separators=(",", ":"))
        return sha256(canonical.encode("utf-8")).hexdigest()


def validate_source(plan, source, scope):
    if type(plan) is not EditPlan or type(source) is not SourceSnapshot or type(scope) is not RunScope:
        raise EditContractError("TRUSTED_CONTEXT_REQUIRED")
    if source.workspace_id != scope.workspace_id or source.owner_id != scope.user_id:
        raise EditContractError("SOURCE_SCOPE_MISMATCH")
    if plan.asset_id != source.asset_id or plan.source_sha256 != source.sha256:
        raise EditContractError("SOURCE_CHANGED")
    if plan.end_ms > source.duration_ms:
        raise EditContractError("TRIM_OUT_OF_SOURCE")


def parse_edit_plan(raw, source, scope):
    if type(raw) is not str:
        raise EditContractError("INVALID_JSON")
    try:
        if len(raw) > MAX_PLAN_BYTES or len(raw.encode("utf-8")) > MAX_PLAN_BYTES:
            raise EditContractError("PLAN_TOO_LARGE")
        value = json.loads(raw, object_pairs_hook=_pairs, parse_constant=_constant)
    except EditContractError:
        raise
    except (UnicodeError, RecursionError, ValueError, OverflowError):
        raise EditContractError("INVALID_JSON") from None
    _object(value, ("schemaVersion", "source", "trim", "outputProfile"))
    if value["schemaVersion"] != SCHEMA or value["outputProfile"] != PROFILE:
        raise EditContractError("UNSUPPORTED_PLAN")
    source_ref = _object(value["source"], ("assetId", "sha256"))
    trim = _object(value["trim"], ("startMs", "endMs"))
    plan = EditPlan(source_ref["assetId"], source_ref["sha256"], trim["startMs"], trim["endMs"])
    validate_source(plan, source, scope)
    return plan


@dataclass(frozen=True)
class ExportApproval:
    token: str = field(repr=False)
    plan_digest: str
    expires_at: float


@dataclass(frozen=True)
class ExportAuthorization:
    nonce: str = field(repr=False)
    scope: RunScope
    plan_digest: str
    source_sha256: str


class LocalExportGate:
    """Single-run, in-memory permission state. Not connected to an executor.

    The host must authenticate the human separately, re-read current scope and
    source from its own registry, and call cancel/revoke on authority changes.
    A future worker must assert_active again before finalizing output. Multi-
    process use needs a transactional durable equivalent, not a copied object.
    """

    def __init__(self, scope, *, clock=time.monotonic):
        if type(scope) is not RunScope:
            raise EditContractError("TRUSTED_CONTEXT_REQUIRED")
        self._scope = scope
        self._clock = clock
        self._lock = Lock()
        self._state = "preview"
        self._approval = None
        self._source = None
        self._authorization = None

    def _now(self):
        value = self._clock()
        if type(value) not in (float, int) or not math.isfinite(value) or value < 0:
            raise EditContractError("INVALID_CLOCK")
        return value

    def _check_scope(self, current_scope):
        if type(current_scope) is not RunScope or current_scope != self._scope:
            raise EditContractError("RUN_SCOPE_CHANGED")
        if self._state in ("cancelled", "revoked"):
            raise EditContractError("RUN_INACTIVE")

    def approve(self, plan, source, current_scope, *, approved_by, rights_confirmed):
        # approved_by/rights_confirmed are trusted UI decisions, never LLM JSON.
        with self._lock:
            self._check_scope(current_scope)
            if self._state != "preview":
                raise EditContractError("ALREADY_AUTHORIZED")
            if approved_by != self._scope.user_id or rights_confirmed is not True:
                raise EditContractError("HUMAN_APPROVAL_REQUIRED")
            validate_source(plan, source, current_scope)
            approval = ExportApproval(secrets.token_urlsafe(32), plan.digest,
                                      self._now() + APPROVAL_TTL_SECONDS)
            # A revised preview invalidates any earlier approval for this run.
            self._approval = approval
            self._source = source
            return approval

    def authorize(self, token, plan, source, current_scope):
        with self._lock:
            self._check_scope(current_scope)
            grant = self._approval
            if (self._state != "preview" or grant is None or type(token) is not str
                    or len(token) != 43 or not token.isascii()
                    or not compare_digest(token, grant.token)):
                raise EditContractError("INVALID_APPROVAL")
            if self._now() >= grant.expires_at:
                self._approval = None
                raise EditContractError("EXPIRED_APPROVAL")
            validate_source(plan, source, current_scope)
            if plan.digest != grant.plan_digest or source != self._source:
                raise EditContractError("APPROVAL_MISMATCH")
            authorization = ExportAuthorization(secrets.token_urlsafe(32), self._scope,
                                                plan.digest, source.sha256)
            self._approval = None
            self._authorization = authorization
            self._state = "authorized"
            return authorization

    def assert_active(self, authorization, plan, source, current_scope):
        with self._lock:
            self._check_scope(current_scope)
            if (self._state != "authorized" or type(authorization) is not ExportAuthorization
                    or authorization != self._authorization):
                raise EditContractError("AUTHORIZATION_INACTIVE")
            validate_source(plan, source, current_scope)
            if plan.digest != authorization.plan_digest or source != self._source:
                raise EditContractError("AUTHORIZATION_MISMATCH")

    def cancel(self):
        self._invalidate("cancelled")

    def revoke(self):
        self._invalidate("revoked")

    def _invalidate(self, state):
        with self._lock:
            self._state = state
            self._approval = None
            self._authorization = None
            self._source = None
