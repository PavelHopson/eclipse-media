"""
Eclipse Media — backend
FastAPI + yt-dlp + SSE progress + auto-cleanup
"""

import os
import uuid
import json
import glob
import asyncio
import subprocess
import threading
import time
import re
import secrets
import ipaddress
import socket
import sys
import ssl
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Literal
from urllib.parse import urlsplit, urlunsplit

import certifi
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

from local_edit_contract import EditContractError
from local_edit_runtime import LocalEditRuntime, LocalEditRuntimeError
from render_queue_contract import MAX_REQUEST_BYTES, RenderContractError, parse_render_request
from render_queue_runtime import RenderQueueError, RenderQueueRuntime

DOWNLOAD_DIR = os.path.abspath(
    os.environ.get("ECLIPSE_MEDIA_DOWNLOAD_DIR")
    or os.path.join(os.path.dirname(__file__), "downloads")
)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Auto-detect ffmpeg from imageio_ffmpeg if not in PATH
try:
    subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
except (OSError, subprocess.TimeoutExpired):
    try:
        import imageio_ffmpeg
        ffmpeg_dir = os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    except ImportError:
        pass

FILE_TTL_SECONDS = 3600  # файлы живут 1 час

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
MAX_ACTIVE_JOBS = 3
MAX_URL_LENGTH = 2048
BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")
BLOCKED_HOSTS = {
    "localhost",
    "metadata",
    "metadata.google.internal",
    "instance-data",
    "169.254.169.254",
}
VK_VIDEO_HOSTS = {"vk.com", "www.vk.com", "m.vk.com", "vkvideo.ru", "www.vkvideo.ru"}
VK_VIDEO_PATH_RE = re.compile(r"^/video(?P<owner>-?\d+)_(?P<video>\d+)/?$")
VK_TOKEN_ENDPOINT = "https://login.vk.com/"
VK_API_ENDPOINT = "https://api.vk.com/method/video.getByIds?v=5.282&client_id=52461373"
VK_PUBLIC_WEB_CLIENT_ID = "52461373"
VK_RESPONSE_LIMIT = 1_000_000
VK_RESOLVE_CACHE_TTL = 600
VK_RESOLVE_CACHE_LIMIT = 64
vk_resolve_cache: dict[str, tuple[float, str]] = {}
vk_resolve_cache_lock = threading.Lock()
YTDLP_TITLE_PREFIX = "__ECLIPSE_MEDIA_TITLE__:"
YTDLP_PHASE_PREFIX = "__ECLIPSE_MEDIA_PHASE__:"
WINDOWS_RESERVED_FILENAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}
DESKTOP_SESSION_TOKEN = os.environ.get("ECLIPSE_MEDIA_SESSION_TOKEN", "")
if DESKTOP_SESSION_TOKEN and not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", DESKTOP_SESSION_TOKEN):
    raise RuntimeError("ECLIPSE_MEDIA_SESSION_TOKEN must be a 43-128 character URL-safe token")
LOCAL_EDIT_ENABLED = os.environ.get("ECLIPSE_MEDIA_LOCAL_EDIT_ENABLED", "").lower() == "true"
if LOCAL_EDIT_ENABLED and not DESKTOP_SESSION_TOKEN:
    raise RuntimeError("Local edit requires an authenticated desktop session")


def _store_local_edit_result(job_id, path, filename):
    with jobs_lock:
        jobs[job_id] = {
            "status": "done",
            "phase": "complete",
            "created_at": time.time(),
            "progress": 100.0,
            "file": str(path),
            "filename": filename,
            "error": None,
            "process": None,
        }


local_edit_runtime = LocalEditRuntime(
    DOWNLOAD_DIR,
    enabled=LOCAL_EDIT_ENABLED,
    on_success=_store_local_edit_result,
)
render_queue_runtime = RenderQueueRuntime.from_environment()


# ─── Cleanup background task ──────────────────────────────────────────────────

def cleanup_loop():
    """Удаляет файлы старше FILE_TTL_SECONDS каждые 5 минут."""
    while True:
        time.sleep(300)
        now = time.time()
        with jobs_lock:
            expired = [
                jid for jid, job in jobs.items()
                if job.get("created_at", now) < now - FILE_TTL_SECONDS
            ]
            expired_jobs = [jobs.pop(jid) for jid in expired]
        for job in expired_jobs:
            process = job.get("process")
            if process and process.poll() is None:
                process.kill()
            fpath = job.get("file")
            if fpath and os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except OSError:
                    pass
        local_edit_runtime.cleanup(now - FILE_TTL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    t = threading.Thread(target=cleanup_loop, daemon=True)
    t.start()
    try:
        yield
    finally:
        render_queue_runtime.close()


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Eclipse Media", version="1.6.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://tauri.localhost",
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_desktop_session_token(provided: str | None, expected: str) -> bool:
    """Constant-time desktop session authentication without logging either value."""
    if not expected or not provided:
        return False
    return secrets.compare_digest(provided, expected)


@app.middleware("http")
async def require_desktop_session(request: Request, call_next):
    if (
        DESKTOP_SESSION_TOKEN
        and request.method != "OPTIONS"
        and not validate_desktop_session_token(
            request.headers.get("X-Eclipse-Media-Session"),
            DESKTOP_SESSION_TOKEN,
        )
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Desktop session authentication required"},
            headers={"Cache-Control": "no-store"},
        )
    return await call_next(request)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class InfoRequest(BaseModel):
    url: str
    proxy: str | None = None

class DownloadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    format: str = "video"        # "video" | "audio"
    format_id: str | None = None
    format_height: int | None = None
    title: str = ""
    audio_format: str = "mp3"    # "mp3" | "flac" | "opus" | "m4a" | "wav"
    audio_quality: str = "best"  # "best" | "320" | "192" | "128"
    proxy: str | None = None     # "socks5://host:port" | "http://host:port"
    rights_confirmed: bool = False
    preset: Literal["standard", "archive"] = "standard"
    subtitle_mode: Literal["none", "manual", "auto"] = "none"
    subtitle_lang: str = "en"

class TranscriptRequest(BaseModel):
    url: str
    lang: str = "auto"
    proxy: str | None = None
    rights_confirmed: bool = False

class ProxyTestRequest(BaseModel):
    proxy: str


class LocalEditSourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    job_id: str


class LocalEditApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    plan_json: str
    rights_confirmed: bool


class LocalEditStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    run_id: str
    approval_token: str
    plan_json: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def _validate_public_host(hostname: str) -> None:
    host = hostname.rstrip(".").lower()
    if not host or host in BLOCKED_HOSTS or host.endswith(BLOCKED_HOST_SUFFIXES):
        raise HTTPException(400, "Локальные и служебные адреса запрещены")

    try:
        parsed_ip = ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r"[a-z0-9.-]+", host) or ".." in host:
            raise HTTPException(400, "Некорректный адрес сайта")
        try:
            addresses = {item[4][0] for item in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
        except socket.gaierror:
            raise HTTPException(400, "Не удалось определить адрес сайта")
        if not addresses or any(not _is_public_ip(address) for address in addresses):
            raise HTTPException(400, "Адрес сайта ведёт во внутреннюю сеть")
    else:
        if not parsed_ip.is_global:
            raise HTTPException(400, "Внутренние IP-адреса запрещены")


def validate_media_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url:
        raise HTTPException(400, "URL не указан")
    if len(url) > MAX_URL_LENGTH:
        raise HTTPException(400, "URL слишком длинный")

    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        raise HTTPException(400, "Некорректный URL")

    if parsed.scheme.lower() not in {"http", "https"}:
        raise HTTPException(400, "Разрешены только HTTP и HTTPS ссылки")
    if parsed.username or parsed.password:
        raise HTTPException(400, "Ссылки с логином или паролем запрещены")
    if not parsed.hostname:
        raise HTTPException(400, "В ссылке не указан сайт")
    if port is not None and not 1 <= port <= 65535:
        raise HTTPException(400, "Некорректный порт")

    _validate_public_host(parsed.hostname)
    clean_netloc = parsed.hostname.lower()
    if ":" in clean_netloc:
        clean_netloc = f"[{clean_netloc}]"
    if port is not None:
        clean_netloc = f"{clean_netloc}:{port}"
    return urlunsplit((parsed.scheme.lower(), clean_netloc, parsed.path or "/", parsed.query, ""))


def validate_proxy_url(raw_proxy: str | None) -> str | None:
    if not raw_proxy or not raw_proxy.strip():
        return None
    proxy = raw_proxy.strip()
    if len(proxy) > 512:
        raise HTTPException(400, "Адрес proxy слишком длинный")
    try:
        parsed = urlsplit(proxy)
        port = parsed.port
    except ValueError:
        raise HTTPException(400, "Некорректный адрес proxy")
    if parsed.scheme.lower() not in {"http", "https", "socks5", "socks5h"}:
        raise HTTPException(400, "Поддерживаются HTTP, HTTPS и SOCKS5 proxy")
    if parsed.username or parsed.password:
        raise HTTPException(400, "Передавайте proxy без логина и пароля")
    if not parsed.hostname or port is None:
        raise HTTPException(400, "Для proxy нужны адрес и порт")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise HTTPException(400, "В адресе proxy не должно быть path, query или fragment")
    _validate_public_host(parsed.hostname)
    return proxy


class _FixedHostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Allow HTTPS redirects only between the fixed VK hosts used by the resolver."""

    allowed_hosts = {"login.vk.com", "api.vk.com"}

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        parsed = urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in self.allowed_hosts:
            raise urllib.error.HTTPError(newurl, code, "Небезопасный redirect VK", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _vk_opener(proxy: str | None) -> urllib.request.OpenerDirector:
    handlers: list[urllib.request.BaseHandler] = [
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())),
        _FixedHostRedirectHandler(),
    ]
    if proxy and urlsplit(proxy).scheme in {"http", "https"}:
        handlers.insert(0, urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    else:
        handlers.insert(0, urllib.request.ProxyHandler({}))
    return urllib.request.build_opener(*handlers)


def _read_bounded_json(response) -> dict:  # noqa: ANN001
    payload = response.read(VK_RESPONSE_LIMIT + 1)
    if len(payload) > VK_RESPONSE_LIMIT:
        raise ValueError("VK response exceeds the size limit")
    decoded = json.loads(payload.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("VK returned an unexpected response")
    return decoded


def _fetch_vk_guest_token(proxy: str | None) -> str:
    query = urllib.parse.urlencode({
        "act": "get_anonym_token",
        "client_id": VK_PUBLIC_WEB_CLIENT_ID,
        "scopes": "scopes=audio_anonymous,video_anonymous,photos_anonymous,profile_anonymous",
    })
    request = urllib.request.Request(
        f"{VK_TOKEN_ENDPOINT}?{query}",
        headers={"Accept": "application/json"},
        method="GET",
    )
    with _vk_opener(proxy).open(request, timeout=20) as response:
        payload = _read_bounded_json(response)
    data = payload.get("data")
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token.startswith("anonym.") or len(token) > 4096:
        raise ValueError("VK did not return a valid guest token")
    return token


def _fetch_vk_video_item(token: str, video_id: str, proxy: str | None) -> dict:
    body = urllib.parse.urlencode({
        "access_token": token,
        "videos": video_id,
        "video_fields": "files",
    }).encode("ascii")
    request = urllib.request.Request(
        VK_API_ENDPOINT,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with _vk_opener(proxy).open(request, timeout=20) as response:
        payload = _read_bounded_json(response)
    response_data = payload.get("response")
    items = response_data.get("items", []) if isinstance(response_data, dict) else []
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        raise ValueError("VK did not return public video metadata")
    return items[0]


def resolve_vk_external_url(url: str, proxy: str | None = None) -> str:
    """Resolve a public VK wrapper to a strict OK.ru embed URL without cookies or OAuth."""
    parsed = urlsplit(url)
    match = VK_VIDEO_PATH_RE.fullmatch(parsed.path)
    if parsed.hostname not in VK_VIDEO_HOSTS or not match:
        return url
    # urllib has no SOCKS transport. Never bypass a proxy explicitly selected by the user.
    if proxy and urlsplit(proxy).scheme in {"socks5", "socks5h"}:
        return url

    now = time.monotonic()
    with vk_resolve_cache_lock:
        cached = vk_resolve_cache.get(url)
        if cached and cached[0] > now:
            return cached[1]

    video_id = f"{match.group('owner')}_{match.group('video')}"
    try:
        token = _fetch_vk_guest_token(proxy)
        item = _fetch_vk_video_item(token, video_id, proxy)
    except (OSError, TimeoutError, ValueError, json.JSONDecodeError):
        return url

    files = item.get("files")
    external = files.get("external") if isinstance(files, dict) else None
    external = external or item.get("player")
    if not isinstance(external, str) or len(external) > MAX_URL_LENGTH:
        return url
    try:
        external_parsed = urlsplit(external)
        external_port = external_parsed.port
    except ValueError:
        return url
    external_match = re.fullmatch(r"/video(?:embed)?/(\d+)/?", external_parsed.path)
    if (
        external_parsed.scheme != "https"
        or external_parsed.hostname not in {"ok.ru", "www.ok.ru"}
        or external_parsed.username
        or external_parsed.password
        or external_port is not None
        or not external_match
    ):
        return url

    resolved = f"https://ok.ru/videoembed/{external_match.group(1)}"
    with vk_resolve_cache_lock:
        if len(vk_resolve_cache) >= VK_RESOLVE_CACHE_LIMIT:
            expired = [key for key, (expires, _) in vk_resolve_cache.items() if expires <= now]
            for key in expired:
                vk_resolve_cache.pop(key, None)
            if len(vk_resolve_cache) >= VK_RESOLVE_CACHE_LIMIT:
                vk_resolve_cache.pop(next(iter(vk_resolve_cache)))
        vk_resolve_cache[url] = (now + VK_RESOLVE_CACHE_TTL, resolved)
    return resolved


def parse_srt(content: str) -> list[dict]:
    """
    Парсит SRT-субтитры в список сегментов.
    Убирает: порядковые номера, теги <c>, <font>, HTML-энтити.
    Возвращает [{ "start": "00:00:01,000", "end": "00:00:03,000", "text": "..." }]
    """
    tag_re = re.compile(r'<[^>]+>')
    entity_re = re.compile(r'&[a-z]+;|&#\d+;')
    ts_re = re.compile(
        r'(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})'
    )

    segments = []
    current: dict | None = None

    for raw_line in content.splitlines():
        line = raw_line.strip()

        if not line:
            if current and current.get("text"):
                segments.append(current)
            current = None
            continue

        m = ts_re.match(line)
        if m:
            current = {"start": m.group(1), "end": m.group(2), "text": ""}
            continue

        if current is not None:
            clean = tag_re.sub("", line)
            clean = entity_re.sub(" ", clean).strip()
            if clean and not clean.isdigit():  # пропускаем порядковые номера
                current["text"] = (current["text"] + " " + clean).strip()
        # строки без текущего блока — порядковые номера перед timestamp, пропускаем

    if current and current.get("text"):
        segments.append(current)

    return segments


def srt_to_plain_text(segments: list[dict]) -> str:
    """Объединяет сегменты в читаемый текст, убирая дубли соседних строк."""
    lines = []
    prev = ""
    for seg in segments:
        text = seg["text"]
        if text and text != prev:
            lines.append(text)
            prev = text
    return " ".join(lines)


def _ytdlp_base(proxy: str | None = None) -> list[str]:
    """Base yt-dlp flags. Runtime network code is opt-in, never implicit."""
    if getattr(sys, "frozen", False):
        # A PyInstaller one-file executable is not a Python interpreter. Route the
        # child process back through the explicit sidecar yt-dlp entry point instead
        # of accidentally starting desktop_sidecar.py with `-m yt_dlp` arguments.
        cmd = [sys.executable, "--eclipse-ytdlp"]
    else:
        cmd = [sys.executable, "-m", "yt_dlp"]
    cmd += ["--no-playlist", "--no-warnings", "--js-runtimes", "node"]
    if os.getenv("ECLIPSE_MEDIA_ALLOW_REMOTE_COMPONENTS", "").lower() in {"1", "true", "yes"}:
        cmd += ["--remote-components", "ejs:github"]
    if proxy and proxy.strip():
        cmd += ["--proxy", proxy.strip()]
    return cmd


def sanitize_filename(title: str, ext: str) -> str:
    if not title:
        return f"download{ext}"
    safe = re.sub(r'[\x00-\x1f\x7f\\/:*?"<>|]', '', title)
    safe = re.sub(r"\s+", " ", safe).strip(" .")[:60].rstrip(" .")
    if safe.upper() in WINDOWS_RESERVED_FILENAMES:
        safe = f"download-{safe}"
    return f"{safe}{ext}" if safe else f"download{ext}"


def parse_ytdlp_title_line(line: str) -> str | None:
    """Read the actual extractor title without trusting a client-supplied filename."""
    stripped = line.strip()
    if not stripped.startswith(YTDLP_TITLE_PREFIX):
        return None
    try:
        title = json.loads(stripped[len(YTDLP_TITLE_PREFIX):])
    except json.JSONDecodeError:
        return None
    if not isinstance(title, str):
        return None
    title = title.strip()
    return title if 0 < len(title) <= 300 else None


def parse_ytdlp_phase_line(line: str) -> str | None:
    stripped = line.strip()
    if not stripped.startswith(YTDLP_PHASE_PREFIX):
        return None
    phase = stripped[len(YTDLP_PHASE_PREFIX):]
    return phase if phase in {"downloading", "processing", "finalizing"} else None


def parse_progress_line(line: str) -> dict | None:
    """
    Парсит строку прогресса yt-dlp:
    [download]  45.6% of   10.00MiB at    1.23MiB/s ETA 00:05
    """
    percent_match = re.search(r"\[download\]\s+([\d.]+)%", line)
    if percent_match:
        result: dict = {"type": "progress", "percent": float(percent_match.group(1))}
        speed_match = re.search(r"\bat\s+([\d.]+\w+/s)", line)
        eta_match = re.search(r"\bETA\s+([\d:]+|Unknown)", line)
        fragment_match = re.search(r"\(frag\s+(\d+)/(\d+)\)", line)
        if speed_match:
            result["speed"] = speed_match.group(1)
        if eta_match and eta_match.group(1) != "Unknown":
            result["eta"] = eta_match.group(1)
        if fragment_match:
            fragment_current = int(fragment_match.group(1))
            fragment_total = int(fragment_match.group(2))
            result["fragment_current"] = fragment_current
            result["fragment_total"] = fragment_total
            if fragment_total > 0:
                result["percent"] = min(99.9, round(fragment_current / fragment_total * 100, 1))
        return result
    # Финальная строка после конвертации
    if "[download] 100%" in line or "Destination:" in line:
        return {"type": "progress", "percent": 100.0}
    return None


def format_ytdlp_error(output_lines: list[str]) -> str:
    """Return an actionable message without exposing URLs, query tokens, or raw CLI output."""
    output = "\n".join(output_lines).lower()
    if "certificate_verify_failed" in output or "certificate verify failed" in output:
        return "Не удалось проверить TLS-сертификат источника. Перезапустите Eclipse Media для обновления CA bundle."
    if "unable to extract cursor data" in output:
        return "VK изменил API списка видео. Откройте конкретный ролик и вставьте его прямую ссылку."
    if "requested format is not available" in output:
        return "Выбранное качество больше недоступно. Обновите данные ролика и выберите другое качество."
    if any(marker in output for marker in ("sign in", "log in", "login required", "cookies")):
        return "Ролик требует авторизацию. Безопасный режим без cookies аккаунта его не скачает."
    if "http error 403" in output or "forbidden" in output:
        return "Источник отклонил основной и совместимый потоки (HTTP 403). Попробуйте меньшее качество или другой публичный источник."
    if "http error 404" in output or "not found" in output:
        return "Видео не найдено. Проверьте, что это прямая публичная ссылка на существующий ролик."
    if "unsupported url" in output:
        return "Эта ссылка пока не поддерживается. Используйте прямую публичную ссылку на ролик."
    if any(marker in output for marker in ("unable to download webpage", "network is unreachable", "timed out")):
        return "Не удалось подключиться к источнику. Проверьте сеть или proxy и повторите."
    if "ffmpeg" in output and any(marker in output for marker in ("not found", "not installed")):
        return "FFmpeg не найден. Установите FFmpeg и перезапустите Eclipse Media."
    return "Не удалось прочитать источник после повторной проверки. Убедитесь, что открывается сам публичный ролик, и попробуйте ещё раз."


def is_recoverable_stream_rejection(output_lines: list[str]) -> bool:
    """Retry one anonymous media-stream rejection, never an authentication failure."""
    output = "\n".join(output_lines).lower()
    auth_markers = ("login required", "sign in", "log in", "cookies", "private video")
    return (
        ("http error 403" in output or "forbidden" in output)
        and not any(marker in output for marker in auth_markers)
    )


def is_retryable_ytdlp_error(output_lines: list[str]) -> bool:
    """Retry only failures that can reasonably recover without user action."""
    output = "\n".join(output_lines).lower()
    permanent_markers = (
        "unsupported url",
        "http error 404",
        "not found",
        "private video",
        "video unavailable",
        "login required",
        "sign in",
        "log in",
        "cookies",
    )
    return not any(marker in output for marker in permanent_markers)


def run_ytdlp_info(command: list[str]) -> subprocess.CompletedProcess[str]:
    """Read metadata with one bounded retry for transient extractor/source failures."""
    result: subprocess.CompletedProcess[str] | None = None
    for attempt in range(2):
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return result
        if attempt == 0 and is_retryable_ytdlp_error(result.stderr.splitlines()):
            time.sleep(0.35)
            continue
        break
    assert result is not None
    return result


LOCAL_EDIT_ERRORS = {
    "LOCAL_EDIT_DISABLED": (409, "Локальный экспорт доступен только в приложении Eclipse Media"),
    "FFMPEG_UNAVAILABLE": (503, "FFmpeg не найден. Установите FFmpeg и перезапустите приложение"),
    "SOURCE_NOT_READY": (409, "Исходный MP4 ещё не готов"),
    "SOURCE_OUTSIDE_REGISTRY": (400, "Разрешены только файлы из завершённых задач Eclipse Media"),
    "SOURCE_NOT_REGISTERED": (409, "Сначала выберите и проверьте исходный MP4"),
    "UNSUPPORTED_SOURCE": (415, "Для локального монтажа нужен MP4"),
    "INVALID_MEDIA": (422, "Не удалось проверить структуру MP4"),
    "SOURCE_LIMIT_EXCEEDED": (413, "MP4 превышает безопасный лимит"),
    "SOURCE_CHANGED": (409, "Исходник изменился. Создайте новый предпросмотр"),
    "HUMAN_APPROVAL_REQUIRED": (403, "Подтвердите право на обработку файла"),
    "RUN_NOT_FOUND": (404, "Операция монтажа не найдена"),
    "RUN_ALREADY_STARTED": (409, "Это разрешение уже использовано"),
    "EXPORT_BUSY": (429, "Дождитесь завершения текущего экспорта"),
    "EXPIRED_APPROVAL": (409, "Разрешение истекло. Подтвердите экспорт ещё раз"),
    "INVALID_APPROVAL": (403, "Разрешение недействительно"),
    "APPROVAL_MISMATCH": (409, "План изменился после подтверждения"),
    "INVALID_JSON": (400, "Некорректный план монтажа"),
    "INVALID_SCHEMA": (400, "Некорректный план монтажа"),
    "UNSUPPORTED_PLAN": (400, "Профиль монтажа не поддерживается"),
    "PLAN_TOO_LARGE": (413, "План монтажа слишком большой"),
    "INVALID_TRIM": (400, "Проверьте границы клипа"),
    "TRIM_OUT_OF_SOURCE": (400, "Границы клипа выходят за исходник"),
    "ENCODER_FAILED": (422, "FFmpeg не смог подготовить клип"),
    "OUTPUT_INVALID": (500, "Результат экспорта не прошёл проверку"),
    "OUTPUT_LIMIT_EXCEEDED": (500, "Результат экспорта превышает лимит"),
    "OUTPUT_PROFILE_MISMATCH": (500, "Результат не соответствует безопасному профилю"),
    "WORKER_TIMEOUT": (504, "Экспорт остановлен по тайм-ауту"),
    "LOCAL_EDIT_FAILED": (500, "Не удалось безопасно подготовить клип"),
}

RENDER_QUEUE_ERRORS = {
    "RENDER_QUEUE_DISABLED": (409, "Очередь рендера доступна только в локальном Eclipse Media"),
    "RENDER_RUNTIME_UNAVAILABLE": (503, "Локальный renderer не готов. Перезапустите Eclipse Media через launcher"),
    "RENDER_RUNTIME_MISMATCH": (503, "Версия локального renderer не прошла проверку"),
    "DISK_LIMIT_REACHED": (507, "Для безопасного рендера нужно не менее 2 ГБ свободного места"),
    "REQUEST_TOO_LARGE": (413, "Данные рендера превышают лимит 32 КБ"),
    "INVALID_JSON": (400, "Не удалось прочитать данные рендера"),
    "DUPLICATE_FIELD": (400, "В данных рендера есть повторяющиеся поля"),
    "INVALID_SCHEMA": (400, "Состав данных рендера не поддерживается"),
    "UNSUPPORTED_REQUEST": (400, "Шаблон или формат рендера не поддерживается"),
    "INVALID_TEXT": (400, "Проверьте текст сцен"),
    "SENSITIVE_TEXT": (400, "Текст похож на секрет или ключ доступа"),
    "UNSAFE_TEXT": (400, "Ссылки в тексте релизного ролика запрещены"),
    "UNSAFE_EXECUTION": (400, "Параметры выполнения изменять нельзя"),
    "INVALID_TIMELINE": (400, "Timeline должен содержать пять фиксированных сцен"),
    "HUMAN_APPROVAL_REQUIRED": (403, "Подтвердите факты, отсутствие секретов и просмотр макета"),
    "INVALID_REQUEST": (400, "Данные рендера отклонены"),
    "INVALID_APPROVAL": (403, "Подтверждение рендера недействительно"),
    "EXPIRED_APPROVAL": (409, "Подтверждение истекло. Проверьте макет ещё раз"),
    "APPROVAL_MISMATCH": (409, "Текст изменился после подтверждения"),
    "QUEUE_FULL": (429, "Очередь заполнена: дождитесь или отмените одну из задач"),
    "APPROVAL_LIMIT_REACHED": (429, "Слишком много неподтверждённых операций. Подождите две минуты"),
    "JOB_NOT_FOUND": (404, "Задача рендера не найдена"),
    "RESULT_NOT_READY": (409, "Результат рендера ещё не готов"),
    "WORKER_TIMEOUT": (504, "Рендер остановлен по тайм-ауту"),
    "RENDER_FAILED": (422, "Локальный renderer не смог собрать ролик"),
    "OUTPUT_INVALID": (500, "Результат рендера не прошёл проверку"),
    "OUTPUT_LIMIT_EXCEEDED": (500, "Результат рендера превышает лимит 512 МБ"),
}


def raise_local_edit_http(error: Exception):
    status, message = LOCAL_EDIT_ERRORS.get(str(error), (400, "Операция монтажа отклонена"))
    raise HTTPException(status, message) from None


def raise_render_queue_http(error: Exception):
    status, message = RENDER_QUEUE_ERRORS.get(str(error), (400, "Операция рендера отклонена"))
    raise HTTPException(status, message) from None


LOCAL_RENDER_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://tauri.localhost",
    "tauri://localhost",
}


def require_local_render_origin(request: Request):
    """CSRF guard for browser launcher; desktop requests already use a secret session header."""
    if DESKTOP_SESSION_TOKEN:
        return
    origin = request.headers.get("Origin")
    if origin not in LOCAL_RENDER_ORIGINS:
        raise HTTPException(403, "Запустите рендер из локального интерфейса Eclipse Media")


async def parse_render_request_http(request: Request):
    content_type = request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise HTTPException(415, "Для рендера требуется JSON")
    try:
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                raise RenderContractError("REQUEST_TOO_LARGE")
            body.extend(chunk)
        return parse_render_request(bytes(body))
    except RenderContractError as error:
        raise_render_queue_http(error)


def _validated_run_id(value: str) -> str:
    try:
        valid = str(uuid.UUID(value)) == value
    except (ValueError, AttributeError):
        valid = False
    if not valid:
        raise HTTPException(400, "Некорректный идентификатор операции")
    return value


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "version": "1.6.0",
        "desktop_session": bool(DESKTOP_SESSION_TOKEN),
        "local_edit": local_edit_runtime.capability()["mode"],
        "render_queue": render_queue_runtime.capability()["mode"],
    }


@app.get("/api/render-queue/capability")
def render_queue_capability():
    return {"ok": True, "data": render_queue_runtime.capability()}


@app.get("/api/render-queue/jobs")
def render_queue_jobs():
    return {"ok": True, "data": render_queue_runtime.list_jobs()}


@app.get("/api/render-queue/audit")
def render_queue_audit():
    return {"ok": True, "data": render_queue_runtime.audit()}


@app.post("/api/render-queue/approvals")
async def approve_render_queue(request: Request):
    require_local_render_origin(request)
    render_request = await parse_render_request_http(request)
    try:
        approval = render_queue_runtime.approve(render_request)
    except RenderQueueError as error:
        raise_render_queue_http(error)
    return JSONResponse({"ok": True, "data": approval}, headers={"Cache-Control": "no-store"})


@app.post("/api/render-queue/jobs")
async def submit_render_queue(request: Request):
    require_local_render_origin(request)
    render_request = await parse_render_request_http(request)
    try:
        job = render_queue_runtime.submit(
            render_request,
            request.headers.get("X-Eclipse-Render-Approval"),
        )
    except RenderQueueError as error:
        raise_render_queue_http(error)
    return JSONResponse({"ok": True, "data": job}, headers={"Cache-Control": "no-store"})


@app.delete("/api/render-queue/jobs/{job_id}")
def cancel_render_queue(job_id: str, request: Request):
    require_local_render_origin(request)
    try:
        job = render_queue_runtime.cancel(job_id)
    except RenderQueueError as error:
        raise_render_queue_http(error)
    return {"ok": True, "data": job}


@app.get("/api/render-queue/jobs/{job_id}/file")
def render_queue_file(job_id: str):
    try:
        path, filename = render_queue_runtime.result_path(job_id)
    except RenderQueueError as error:
        raise_render_queue_http(error)
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=filename,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/local-edit/capability")
def local_edit_capability():
    return {"ok": True, "data": local_edit_runtime.capability()}


@app.get("/api/local-edit/sources")
def local_edit_sources():
    capability = local_edit_runtime.capability()
    if not capability["ready"]:
        raise_local_edit_http(LocalEditRuntimeError(capability["reason"]))
    with jobs_lock:
        available = [
            {
                "jobId": job_id,
                "filename": job.get("filename") or "video.mp4",
            }
            for job_id, job in jobs.items()
            if (
                re.fullmatch(r"[0-9a-f]{32}", job_id)
                and job.get("status") == "done"
                and isinstance(job.get("file"), str)
                and os.path.isfile(job["file"])
                and os.path.splitext(job["file"])[1].lower() == ".mp4"
            )
        ]
    return {"ok": True, "data": available}


@app.post("/api/local-edit/source")
def local_edit_source(req: LocalEditSourceRequest):
    if re.fullmatch(r"[0-9a-f]{32}", req.job_id) is None:
        raise HTTPException(400, "Некорректный идентификатор исходника")
    with jobs_lock:
        job = dict(jobs.get(req.job_id) or {})
    try:
        source = local_edit_runtime.register_job(req.job_id, job)
    except (LocalEditRuntimeError, EditContractError) as error:
        raise_local_edit_http(error)
    return {"ok": True, "data": source}


@app.post("/api/local-edit/approve")
def local_edit_approve(req: LocalEditApproveRequest):
    try:
        approval = local_edit_runtime.approve(
            req.plan_json,
            rights_confirmed=req.rights_confirmed,
        )
    except (LocalEditRuntimeError, EditContractError) as error:
        raise_local_edit_http(error)
    return {"ok": True, "data": approval}


@app.post("/api/local-edit/start")
def local_edit_start(req: LocalEditStartRequest):
    run_id = _validated_run_id(req.run_id)
    try:
        run = local_edit_runtime.start(run_id, req.approval_token, req.plan_json)
    except (LocalEditRuntimeError, EditContractError) as error:
        raise_local_edit_http(error)
    return {"ok": True, "data": run}


@app.get("/api/local-edit/run/{run_id}")
def local_edit_run(run_id: str):
    try:
        run = local_edit_runtime.status(_validated_run_id(run_id))
    except (LocalEditRuntimeError, EditContractError) as error:
        raise_local_edit_http(error)
    return {"ok": True, "data": run}


@app.delete("/api/local-edit/run/{run_id}")
def cancel_local_edit_run(run_id: str):
    try:
        run = local_edit_runtime.cancel(_validated_run_id(run_id))
    except (LocalEditRuntimeError, EditContractError) as error:
        raise_local_edit_http(error)
    return {"ok": True, "data": run}


@app.post("/api/proxy-test")
def proxy_test(req: ProxyTestRequest):
    """Test if proxy works by fetching YouTube homepage."""
    proxy = validate_proxy_url(req.proxy)
    cmd = _ytdlp_base(proxy) + ["--simulate", "--print", "title",
                                      "https://www.youtube.com/watch?v=jNQXAC9IVRw"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return {"ok": True, "message": "Прокси работает"}
        return {"ok": False, "message": result.stderr.strip()[:200] or "Ошибка подключения"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "message": "Таймаут — прокси не отвечает"}
    except Exception:
        return {"ok": False, "message": "Не удалось проверить proxy"}


@app.post("/api/info")
def get_info(req: InfoRequest):
    url = validate_media_url(req.url)
    proxy = validate_proxy_url(req.proxy)
    url = resolve_vk_external_url(url, proxy)

    cmd = _ytdlp_base(proxy) + ["-j", url]
    try:
        result = run_ytdlp_info(cmd)
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Превышено время ожидания (60s)")
    except FileNotFoundError:
        raise HTTPException(500, "yt-dlp не установлен")

    if result.returncode != 0:
        raise HTTPException(400, format_ytdlp_error(result.stderr.splitlines()))

    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(500, "Не удалось разобрать ответ yt-dlp")

    # Лучший формат на каждое разрешение
    best_by_height: dict[int, dict] = {}
    for f in info.get("formats", []):
        height = f.get("height")
        if height and f.get("vcodec", "none") != "none":
            tbr = f.get("tbr") or 0
            if height not in best_by_height or tbr > (best_by_height[height].get("tbr") or 0):
                best_by_height[height] = f

    formats = sorted(
        [{"id": f["format_id"], "label": f"{h}p", "height": h} for h, f in best_by_height.items()],
        key=lambda x: x["height"],
        reverse=True,
    )

    return {
        "ok": True,
        "data": {
            "title": info.get("title", ""),
            "thumbnail": info.get("thumbnail", ""),
            "duration": info.get("duration"),
            "uploader": info.get("uploader", ""),
            "webpage_url": info.get("webpage_url", url),
            "formats": formats,
        },
    }


@app.post("/api/download")
def start_download(req: DownloadRequest):
    if not req.rights_confirmed:
        raise HTTPException(403, "Подтвердите право на скачивание материала")
    if req.format not in {"video", "audio"}:
        raise HTTPException(400, "Неизвестный формат загрузки")
    if req.format_id and not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", req.format_id):
        raise HTTPException(400, "Некорректный ID формата")
    if req.format_height is not None and not 120 <= req.format_height <= 8640:
        raise HTTPException(400, "Некорректное разрешение видео")
    if req.audio_format not in AUDIO_FORMAT_EXT or req.audio_quality not in {"best", "320", "192", "128"}:
        raise HTTPException(400, "Некорректные настройки аудио")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,20}", req.subtitle_lang):
        raise HTTPException(400, "Некорректный код языка субтитров")
    if req.format == "audio" and req.subtitle_mode != "none":
        raise HTTPException(400, "Субтитры можно встроить только в видео")
    if len(req.title) > 300:
        raise HTTPException(400, "Название слишком длинное")
    url = validate_media_url(req.url)
    proxy = validate_proxy_url(req.proxy)
    url = resolve_vk_external_url(url, proxy)

    job_id = uuid.uuid4().hex
    with jobs_lock:
        active_jobs = sum(1 for job in jobs.values() if job.get("status") == "downloading")
        if active_jobs >= MAX_ACTIVE_JOBS:
            raise HTTPException(429, "Одновременно можно выполнять не более трёх загрузок")
        jobs[job_id] = {
            "status": "downloading",
            "phase": "preparing",
            "url": url,
            "title": req.title,
            "created_at": time.time(),
            "progress": 0.0,
            "speed": "",
            "eta": "",
            "fragment_current": None,
            "fragment_total": None,
            "file": None,
            "filename": None,
            "error": None,
            "process": None,
        }

    thread = threading.Thread(
        target=_run_download,
        args=(job_id, url, req.format, req.format_id, req.title,
              req.audio_format, req.audio_quality, proxy, req.preset,
              req.subtitle_mode, req.subtitle_lang, req.format_height),
        daemon=True,
    )
    thread.start()

    return {"ok": True, "data": {"job_id": job_id}}


AUDIO_FORMAT_EXT = {
    "mp3": ".mp3",
    "flac": ".flac",
    "opus": ".opus",
    "m4a": ".m4a",
    "wav": ".wav",
}

def _build_audio_quality_flags(audio_fmt: str, quality: str) -> list[str]:
    """
    Возвращает флаги yt-dlp для управления качеством аудио.
    FLAC и WAV — lossless, качество не применяется.
    """
    if audio_fmt in ("flac", "wav") or quality == "best":
        return ["--audio-quality", "0"]
    return ["--audio-quality", f"{quality}K"]


def _build_download_command(
    url: str,
    out_template: str,
    fmt: str,
    format_id: str | None,
    audio_fmt: str,
    audio_quality: str,
    proxy: str | None,
    preset: str,
    subtitle_mode: str,
    subtitle_lang: str,
    format_height: int | None = None,
    compatible_stream: bool = False,
) -> list[str]:
    """Build an allowlisted yt-dlp command without accepting raw CLI arguments."""
    cmd = _ytdlp_base(proxy) + [
        "-o", out_template,
        "--progress",
        "--print", f"before_dl:{YTDLP_PHASE_PREFIX}downloading",
        "--print", f"post_process:{YTDLP_PHASE_PREFIX}processing",
        "--print", f"after_move:{YTDLP_TITLE_PREFIX}%(title)j",
    ]

    if fmt == "audio":
        safe_fmt = audio_fmt if audio_fmt in AUDIO_FORMAT_EXT else "mp3"
        cmd += ["-x", "--audio-format", safe_fmt]
        cmd += _build_audio_quality_flags(safe_fmt, audio_quality)
    elif compatible_stream:
        # A source may expose metadata and then reject one short-lived progressive URL.
        # Retry once with an extractor-selected HLS stream at or below the chosen
        # resolution. The client cannot provide raw selectors, commands or cookies.
        max_height = min(max(format_height or 2160, 120), 8640)
        selector = "/".join((
            f"best[height<={max_height}][protocol^=m3u8]",
            f"bestvideo[height<={max_height}][protocol^=m3u8]+bestaudio",
            f"best[height<={max_height}]",
            f"bestvideo[height<={max_height}]+bestaudio",
        ))
        cmd += ["-f", selector, "--merge-output-format", "mp4"]
    elif format_id:
        # Some VK formats already contain audio, while YouTube commonly exposes separate tracks.
        # Keep the selected quality, but fail over to that combined stream before a generic best.
        cmd += ["-f", f"{format_id}+bestaudio/{format_id}/best", "--merge-output-format", "mp4"]
    else:
        cmd += ["-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4"]

    if preset == "archive":
        cmd += ["--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg"]

    if fmt == "video" and subtitle_mode != "none":
        cmd += ["--sub-langs", subtitle_lang, "--sub-format", "srt/best", "--embed-subs"]
        cmd.append("--write-auto-subs" if subtitle_mode == "auto" else "--write-subs")

    cmd.append(url)
    return cmd


def _run_download(job_id: str, url: str, fmt: str, format_id: str | None, title: str,
                  audio_fmt: str = "mp3", audio_quality: str = "best",
                  proxy: str | None = None, preset: str = "standard",
                  subtitle_mode: str = "none", subtitle_lang: str = "en",
                  format_height: int | None = None):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return
    out_template = os.path.join(DOWNLOAD_DIR, f"{job_id}.%(ext)s")

    extracted_title: str | None = None
    for attempt in range(2):
        with jobs_lock:
            if jobs.get(job_id) is not job:
                return

        compatible_stream = attempt == 1
        cmd = _build_download_command(
            url, out_template, fmt, format_id, audio_fmt, audio_quality,
            proxy, preset, subtitle_mode, subtitle_lang,
            format_height=format_height,
            compatible_stream=compatible_stream,
        )

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            with jobs_lock:
                if jobs.get(job_id) is not job:
                    proc.kill()
                    return
                job["process"] = proc

            diagnostic_lines: list[str] = []
            for line in proc.stdout:  # type: ignore[union-attr]
                diagnostic_lines.append(line.strip())
                if len(diagnostic_lines) > 40:
                    diagnostic_lines.pop(0)
                parsed_title = parse_ytdlp_title_line(line)
                if parsed_title:
                    extracted_title = parsed_title
                    job["phase"] = "finalizing"
                parsed_phase = parse_ytdlp_phase_line(line)
                if parsed_phase:
                    job["phase"] = parsed_phase
                    if parsed_phase in {"processing", "finalizing"}:
                        job["progress"] = 100.0
                        job["speed"] = ""
                        job["eta"] = ""
                parsed = parse_progress_line(line)
                if parsed:
                    job["phase"] = "downloading"
                    is_fragment_completion = (
                        parsed.get("percent") == 100.0
                        and job.get("fragment_total")
                        and not parsed.get("fragment_total")
                    )
                    if not is_fragment_completion:
                        job["progress"] = parsed.get("percent", job["progress"])
                    job["speed"] = parsed.get("speed", "")
                    job["eta"] = parsed.get("eta", "")
                    job["fragment_current"] = parsed.get("fragment_current", job.get("fragment_current"))
                    job["fragment_total"] = parsed.get("fragment_total", job.get("fragment_total"))

            proc.wait(timeout=300)

            if proc.returncode == 0:
                break

            can_recover = (
                attempt == 0
                and fmt == "video"
                and is_recoverable_stream_rejection(diagnostic_lines)
            )
            if not can_recover:
                job["status"] = "error"
                job["error"] = format_ytdlp_error(diagnostic_lines)
                return

            # The id is generated internally. Cleanup remains bounded to that
            # prefix inside DOWNLOAD_DIR before one automatic retry.
            for partial in glob.glob(os.path.join(DOWNLOAD_DIR, f"{job_id}.*")):
                try:
                    if os.path.isfile(partial):
                        os.remove(partial)
                except OSError:
                    pass
            with jobs_lock:
                if jobs.get(job_id) is not job:
                    return
                job["phase"] = "preparing"
                job["progress"] = 0.0
                job["speed"] = ""
                job["eta"] = ""
                job["fragment_current"] = None
                job["fragment_total"] = None

        except subprocess.TimeoutExpired:
            proc.kill()
            job["status"] = "error"
            job["error"] = "Превышено время загрузки (5 мин)"
            return
        except Exception:
            job["status"] = "error"
            job["error"] = "Не удалось запустить обработку медиа"
            return

    files = glob.glob(os.path.join(DOWNLOAD_DIR, f"{job_id}.*"))
    if not files:
        job["status"] = "error"
        job["error"] = "Файл не найден после загрузки"
        return

    # Выбираем нужный формат
    if fmt == "audio":
        target_ext = AUDIO_FORMAT_EXT.get(audio_fmt, ".mp3")
        chosen = next((f for f in files if f.endswith(target_ext)), files[0])
    else:
        chosen = next((f for f in files if f.endswith(".mp4")), files[0])

    # Удаляем лишние файлы
    for f in files:
        if f != chosen:
            try:
                os.remove(f)
            except OSError:
                pass

    ext = os.path.splitext(chosen)[1]
    job["status"] = "done"
    job["progress"] = 100.0
    job["file"] = chosen
    job["filename"] = sanitize_filename(extracted_title or title, ext)


@app.get("/api/progress/{job_id}")
async def sse_progress(job_id: str):
    """Server-Sent Events — стримит прогресс загрузки."""
    if job_id not in jobs:
        raise HTTPException(404, "Job не найден")

    async def event_stream() -> AsyncGenerator[str, None]:
        while True:
            job = jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job не найден'})}\n\n"
                break

            status = job["status"]

            if status == "downloading":
                payload = {
                    "type": "progress",
                    "percent": round(job["progress"], 1),
                    "phase": job.get("phase", "preparing"),
                    "speed": job.get("speed", ""),
                    "eta": job.get("eta", ""),
                    "fragment_current": job.get("fragment_current"),
                    "fragment_total": job.get("fragment_total"),
                }
                yield f"data: {json.dumps(payload)}\n\n"

            elif status == "done":
                yield f"data: {json.dumps({'type': 'done', 'filename': job['filename']})}\n\n"
                break

            elif status == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': job.get('error', 'Неизвестная ошибка')})}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/file/{job_id}")
def get_file(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job не найден")
    if job["status"] != "done":
        raise HTTPException(409, "Файл ещё не готов")
    if not job["file"] or not os.path.exists(job["file"]):
        raise HTTPException(410, "Файл уже удалён (TTL истёк)")

    return FileResponse(
        job["file"],
        filename=job["filename"],
        media_type="application/octet-stream",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.post("/api/transcript")
def get_transcript(req: TranscriptRequest):
    """
    Извлекает субтитры/транскрипт из видео через yt-dlp.

    Логика:
    1. Пробуем ручные субтитры (--write-subs) на запрошенном языке
    2. Если не найдено — авто-субтитры (--write-auto-subs)
    3. Если lang="auto" — берём первый доступный язык (приоритет: en, ru, затем любой)
    4. Парсим SRT в чистый текст + сегменты с временными метками
    """
    if not req.rights_confirmed:
        raise HTTPException(403, "Подтвердите право на обработку материала")
    url = validate_media_url(req.url)
    proxy = validate_proxy_url(req.proxy)
    url = resolve_vk_external_url(url, proxy)
    if not re.fullmatch(r"(?:auto|[A-Za-z0-9._-]{1,20})", req.lang):
        raise HTTPException(400, "Некорректный код языка")

    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        out_template = os.path.join(tmpdir, "sub")

        # Шаг 1: получаем метаданные + список доступных субтитров
        info_cmd = _ytdlp_base(proxy) + ["-j", url]
        try:
            info_result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "Превышено время ожидания (60s)")
        except FileNotFoundError:
            raise HTTPException(500, "yt-dlp не установлен")

        if info_result.returncode != 0:
            err = info_result.stderr.strip().split("\n")[-1] if info_result.stderr.strip() else "Ошибка"
            raise HTTPException(400, err)

        try:
            info = json.loads(info_result.stdout)
        except json.JSONDecodeError:
            raise HTTPException(500, "Не удалось разобрать ответ yt-dlp")

        # Определяем язык
        manual_subs: dict = info.get("subtitles", {})
        auto_subs: dict = info.get("automatic_captions", {})

        PRIORITY = ["en", "ru", "uk", "de", "fr", "es", "zh", "ja", "ko", "pt", "it", "ar"]

        def pick_lang(subs: dict, requested: str) -> str | None:
            if not subs:
                return None
            if requested != "auto" and requested in subs:
                return requested
            # авто-выбор: сначала приоритетные языки
            for lang in PRIORITY:
                if lang in subs:
                    return lang
            return next(iter(subs), None)

        chosen_lang = pick_lang(manual_subs, req.lang)
        use_auto = False
        if not chosen_lang:
            chosen_lang = pick_lang(auto_subs, req.lang)
            use_auto = True

        if not chosen_lang:
            raise HTTPException(404, "Субтитры недоступны для этого видео")

        # Шаг 2: скачиваем только субтитры нужного языка
        dl_cmd = _ytdlp_base(proxy) + [
            "--skip-download",
            "--convert-subs", "srt",
            "--sub-langs", chosen_lang,
            "-o", out_template,
        ]
        if use_auto:
            dl_cmd.append("--write-auto-subs")
        else:
            dl_cmd.append("--write-subs")
        dl_cmd.append(url)

        try:
            dl_result = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "Превышено время получения субтитров")

        if dl_result.returncode != 0:
            raise HTTPException(502, "Не удалось скачать субтитры")

        # Шаг 3: находим SRT-файл
        srt_files = glob.glob(os.path.join(tmpdir, "*.srt"))
        if not srt_files:
            raise HTTPException(404, "SRT-файл не найден после загрузки")

        srt_path = srt_files[0]
        with open(srt_path, encoding="utf-8", errors="replace") as f:
            srt_content = f.read()

    # Шаг 4: парсинг
    segments = parse_srt(srt_content)
    if not segments:
        raise HTTPException(422, "Субтитры пусты или не поддаются разбору")

    plain_text = srt_to_plain_text(segments)

    return {
        "ok": True,
        "data": {
            "title": info.get("title", ""),
            "uploader": info.get("uploader", ""),
            "duration": info.get("duration"),
            "language": chosen_lang,
            "auto_generated": use_auto,
            "segments_count": len(segments),
            "text": plain_text,
            "segments": segments,
        },
    }


@app.delete("/api/job/{job_id}")
def delete_job(job_id: str):
    with jobs_lock:
        job = jobs.pop(job_id, None)
    if job:
        process = job.get("process")
        if process and process.poll() is None:
            process.kill()
        fpath = job.get("file")
        if fpath and os.path.exists(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass
    return {"ok": True}
