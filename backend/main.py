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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")
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
WINDOWS_RESERVED_FILENAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    t = threading.Thread(target=cleanup_loop, daemon=True)
    t.start()
    yield


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Eclipse Media", version="1.2.2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class InfoRequest(BaseModel):
    url: str
    proxy: str | None = None

class DownloadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    format: str = "video"        # "video" | "audio"
    format_id: str | None = None
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
    cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--no-warnings", "--js-runtimes", "node"]
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


def parse_progress_line(line: str) -> dict | None:
    """
    Парсит строку прогресса yt-dlp:
    [download]  45.6% of   10.00MiB at    1.23MiB/s ETA 00:05
    """
    m = re.search(
        r'\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+/s)\s+ETA\s+([\d:]+)',
        line
    )
    if m:
        return {
            "type": "progress",
            "percent": float(m.group(1)),
            "total": m.group(2),
            "speed": m.group(3),
            "eta": m.group(4),
        }
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
    if "http error 403" in output or "forbidden" in output:
        return "Источник отклонил загрузку (HTTP 403). Обновите данные и попробуйте другое качество."
    if "http error 404" in output or "not found" in output:
        return "Видео не найдено. Проверьте, что это прямая публичная ссылка на существующий ролик."
    if any(marker in output for marker in ("sign in", "log in", "login required", "cookies")):
        return "Ролик требует авторизацию. Безопасный режим без cookies аккаунта его не скачает."
    if "unsupported url" in output:
        return "Эта ссылка пока не поддерживается. Используйте прямую публичную ссылку на ролик."
    if any(marker in output for marker in ("unable to download webpage", "network is unreachable", "timed out")):
        return "Не удалось подключиться к источнику. Проверьте сеть или proxy и повторите."
    if "ffmpeg" in output and any(marker in output for marker in ("not found", "not installed")):
        return "FFmpeg не найден. Установите FFmpeg и перезапустите Eclipse Media."
    return "Источник изменился или временно недоступен. Обновите данные ролика и повторите."


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "version": "1.2.2"}


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
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
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
            "url": url,
            "title": req.title,
            "created_at": time.time(),
            "progress": 0.0,
            "speed": "",
            "eta": "",
            "file": None,
            "filename": None,
            "error": None,
            "process": None,
        }

    thread = threading.Thread(
        target=_run_download,
        args=(job_id, url, req.format, req.format_id, req.title,
              req.audio_format, req.audio_quality, proxy, req.preset,
              req.subtitle_mode, req.subtitle_lang),
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
) -> list[str]:
    """Build an allowlisted yt-dlp command without accepting raw CLI arguments."""
    cmd = _ytdlp_base(proxy) + [
        "-o", out_template,
        "--progress",
        "--print", f"after_move:{YTDLP_TITLE_PREFIX}%(title)j",
    ]

    if fmt == "audio":
        safe_fmt = audio_fmt if audio_fmt in AUDIO_FORMAT_EXT else "mp3"
        cmd += ["-x", "--audio-format", safe_fmt]
        cmd += _build_audio_quality_flags(safe_fmt, audio_quality)
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
                  subtitle_mode: str = "none", subtitle_lang: str = "en"):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return
    out_template = os.path.join(DOWNLOAD_DIR, f"{job_id}.%(ext)s")

    cmd = _build_download_command(
        url, out_template, fmt, format_id, audio_fmt, audio_quality,
        proxy, preset, subtitle_mode, subtitle_lang,
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
        extracted_title: str | None = None
        for line in proc.stdout:  # type: ignore[union-attr]
            diagnostic_lines.append(line.strip())
            if len(diagnostic_lines) > 40:
                diagnostic_lines.pop(0)
            parsed_title = parse_ytdlp_title_line(line)
            if parsed_title:
                extracted_title = parsed_title
            parsed = parse_progress_line(line)
            if parsed:
                job["progress"] = parsed.get("percent", job["progress"])
                job["speed"] = parsed.get("speed", "")
                job["eta"] = parsed.get("eta", "")

        proc.wait(timeout=300)

        if proc.returncode != 0:
            job["status"] = "error"
            job["error"] = format_ytdlp_error(diagnostic_lines)
            return

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
                    "speed": job.get("speed", ""),
                    "eta": job.get("eta", ""),
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
