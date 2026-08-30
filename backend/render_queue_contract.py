"""Strict, data-only contract for the local Eclipse release render queue.

The browser may select copy and a fixed format. It may never select a path,
URL, executable, renderer argument or publishing target.
"""

from dataclasses import dataclass
from hashlib import sha256
import json
import re


SCHEMA = "eclipse.release-render-request.v1"
VARIABLES_SCHEMA = "eclipse.release-variables.v1"
MAX_REQUEST_BYTES = 32 * 1024
FORMATS = {"16:9": "landscape", "9:16": "vertical", "1:1": "square"}
SCENE_IDS = ("signal", "inputs", "pipeline", "quality", "close")
SENSITIVE_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.I),
    re.compile(r"\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*\S{8,}", re.I),
    re.compile(r"\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
)


class RenderContractError(ValueError):
    """Fixed error code only; never echo user text or serialized input."""


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RenderContractError("DUPLICATE_FIELD")
        result[key] = value
    return result


def _constant(_value):
    raise RenderContractError("INVALID_JSON")


def _object(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise RenderContractError("INVALID_SCHEMA")
    return value


def _text(value, maximum):
    if type(value) is not str:
        raise RenderContractError("INVALID_SCHEMA")
    normalized = re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " ").replace("\t", " ")).strip()
    if not normalized or len(normalized) > maximum:
        raise RenderContractError("INVALID_TEXT")
    for character in value:
        point = ord(character)
        if (point <= 8 or point in (11, 12) or 14 <= point <= 31
                or 127 <= point <= 159 or 0x202A <= point <= 0x202E
                or 0x2066 <= point <= 0x2069):
            raise RenderContractError("INVALID_TEXT")
    if any(pattern.search(normalized) for pattern in SENSITIVE_PATTERNS):
        raise RenderContractError("SENSITIVE_TEXT")
    if re.search(r"(?:https?://|www\.)", normalized, re.I):
        raise RenderContractError("UNSAFE_TEXT")
    return normalized


@dataclass(frozen=True)
class ReleaseRenderRequest:
    value: dict

    @property
    def digest(self):
        return sha256(self.canonical_json.encode("utf-8")).hexdigest()

    @property
    def canonical_json(self):
        return json.dumps(self.value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @property
    def variables(self):
        return self.value["variables"]

    @property
    def format_slug(self):
        return FORMATS[self.variables["format"]]


def parse_render_request(raw):
    if type(raw) is not bytes:
        raise RenderContractError("INVALID_JSON")
    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise RenderContractError("REQUEST_TOO_LARGE" if raw else "INVALID_JSON")
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_pairs,
            parse_constant=_constant,
        )
    except RenderContractError:
        raise
    except (UnicodeError, RecursionError, ValueError, OverflowError):
        raise RenderContractError("INVALID_JSON") from None

    _object(value, ("schemaVersion", "variables", "review"))
    if value["schemaVersion"] != SCHEMA:
        raise RenderContractError("UNSUPPORTED_REQUEST")

    variables = _object(value["variables"], (
        "schemaVersion", "sourceBriefSchemaVersion", "templateId", "title", "format",
        "duration", "renderRequiresApproval", "publishRequiresApproval", "execution", "scenes",
    ))
    if (variables["schemaVersion"] != VARIABLES_SCHEMA
            or variables["sourceBriefSchemaVersion"] != "eclipse.release-brief.v1"
            or variables["templateId"] != "eclipse-release-signal"
            or variables["format"] not in FORMATS
            or variables["duration"] != 15
            or variables["renderRequiresApproval"] is not True
            or variables["publishRequiresApproval"] is not True):
        raise RenderContractError("UNSUPPORTED_REQUEST")
    variables["title"] = _text(variables["title"], 80)

    execution = _object(variables["execution"], ("network", "shell", "render", "publish"))
    if any(execution[key] is not False for key in execution):
        raise RenderContractError("UNSAFE_EXECUTION")

    scenes = variables["scenes"]
    if type(scenes) is not list or len(scenes) != 5:
        raise RenderContractError("INVALID_TIMELINE")
    canonical_scenes = []
    for index, scene_value in enumerate(scenes):
        scene = _object(scene_value, ("id", "start", "duration", "eyebrow", "headline", "body"))
        if (scene["id"] != SCENE_IDS[index] or type(scene["start"]) is not int
                or scene["start"] != index * 3 or scene["duration"] != 3):
            raise RenderContractError("INVALID_TIMELINE")
        canonical_scenes.append({
            "id": scene["id"],
            "start": scene["start"],
            "duration": 3,
            "eyebrow": _text(scene["eyebrow"], 48),
            "headline": _text(scene["headline"], 96),
            "body": _text(scene["body"], 220),
        })
    variables["scenes"] = canonical_scenes

    review = _object(value["review"], ("claimsReviewed", "noSensitiveData", "previewReviewed"))
    if any(review[key] is not True for key in review):
        raise RenderContractError("HUMAN_APPROVAL_REQUIRED")
    return ReleaseRenderRequest(value)
