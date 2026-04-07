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
    format: str = "video"   # "video" | "audio"
    format_id: str | None = None
    title: str = ""


# ─── Helpers ──────────────────────────────────────────────────────────────────

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
        args=(job_id, url, req.format, req.format_id, req.title),
        daemon=True,
    )
    thread.start()

    return {"ok": True, "data": {"job_id": job_id}}


def _run_download(job_id: str, url: str, fmt: str, format_id: str | None, title: str):
    job = jobs[job_id]
    out_template = os.path.join(DOWNLOAD_DIR, f"{job_id}.%(ext)s")

    cmd = ["yt-dlp", "--no-playlist", "--no-warnings", "-o", out_template]

    if fmt == "audio":
        cmd += ["-x", "--audio-format", "mp3"]
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
        chosen = next((f for f in files if f.endswith(".mp3")), files[0])
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
