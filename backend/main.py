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
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

FILE_TTL_SECONDS = 3600  # файлы живут 1 час

jobs: dict[str, dict] = {}


# ─── Cleanup background task ──────────────────────────────────────────────────

def cleanup_loop():
    """Удаляет файлы старше FILE_TTL_SECONDS каждые 5 минут."""
    while True:
        time.sleep(300)
        now = time.time()
        expired = [
            jid for jid, j in list(jobs.items())
            if j.get("created_at", now) < now - FILE_TTL_SECONDS
        ]
        for jid in expired:
            job = jobs.pop(jid, None)
            if job:
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

app = FastAPI(title="Eclipse Media", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format: str = "video"        # "video" | "audio"
    format_id: str | None = None
    title: str = ""
    audio_format: str = "mp3"    # "mp3" | "flac" | "opus" | "m4a" | "wav"
    audio_quality: str = "best"  # "best" | "320" | "192" | "128"

class TranscriptRequest(BaseModel):
    url: str
    lang: str = "auto"  # "auto" | код языка ISO 639-1 (en, ru, es, ...)


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


def sanitize_filename(title: str, ext: str) -> str:
    if not title:
        return f"download{ext}"
    safe = re.sub(r'[\\/:*?"<>|]', '', title).strip()[:60].strip()
    return f"{safe}{ext}" if safe else f"download{ext}"


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


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "version": "1.0.0"}


@app.post("/api/info")
def get_info(req: InfoRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL не указан")

    cmd = ["yt-dlp", "--no-playlist", "-j", "--no-warnings", url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Превышено время ожидания (60s)")
    except FileNotFoundError:
        raise HTTPException(500, "yt-dlp не установлен")

    if result.returncode != 0:
        err = result.stderr.strip().split("\n")[-1] if result.stderr.strip() else "Неизвестная ошибка"
        raise HTTPException(400, err)

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
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL не указан")

    job_id = uuid.uuid4().hex[:12]
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
    }

    thread = threading.Thread(
        target=_run_download,
        args=(job_id, url, req.format, req.format_id, req.title,
              req.audio_format, req.audio_quality),
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


def _run_download(job_id: str, url: str, fmt: str, format_id: str | None, title: str,
                  audio_fmt: str = "mp3", audio_quality: str = "best"):
    job = jobs[job_id]
    out_template = os.path.join(DOWNLOAD_DIR, f"{job_id}.%(ext)s")

    cmd = ["yt-dlp", "--no-playlist", "--no-warnings", "-o", out_template]

    if fmt == "audio":
        safe_fmt = audio_fmt if audio_fmt in AUDIO_FORMAT_EXT else "mp3"
        cmd += ["-x", "--audio-format", safe_fmt]
        cmd += _build_audio_quality_flags(safe_fmt, audio_quality)
    elif format_id:
        cmd += ["-f", f"{format_id}+bestaudio/best", "--merge-output-format", "mp4"]
    else:
        cmd += ["-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4"]

    cmd.append(url)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in proc.stdout:  # type: ignore[union-attr]
            parsed = parse_progress_line(line)
            if parsed:
                job["progress"] = parsed.get("percent", job["progress"])
                job["speed"] = parsed.get("speed", "")
                job["eta"] = parsed.get("eta", "")

        proc.wait(timeout=300)

        if proc.returncode != 0:
            job["status"] = "error"
            job["error"] = "yt-dlp завершился с ошибкой"
            return

    except subprocess.TimeoutExpired:
        proc.kill()
        job["status"] = "error"
        job["error"] = "Превышено время загрузки (5 мин)"
        return
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
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
    job["filename"] = sanitize_filename(title, ext)


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
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL не указан")

    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        out_template = os.path.join(tmpdir, "sub")

        # Шаг 1: получаем метаданные + список доступных субтитров
        info_cmd = ["yt-dlp", "--no-playlist", "-j", "--no-warnings", url]
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
        dl_cmd = [
            "yt-dlp", "--no-playlist", "--no-warnings",
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
    job = jobs.pop(job_id, None)
    if job:
        fpath = job.get("file")
        if fpath and os.path.exists(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass
    return {"ok": True}
