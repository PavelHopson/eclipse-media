# Cube YouTube Downloader gap analysis

Reviewed: **2026-08-22**
Reference: <https://github.com/database64128/youtube-dl-wpf> (`v1.13.1`)

Cube is a GPLv3 Windows GUI around `youtube-dl`/`yt-dlp`. Eclipse Media is an MIT,
self-hosted web application. No Cube source code is copied: only documented product ideas are
used as clean-room requirements.

| Capability | Cube | Eclipse Media | Decision |
|---|---:|---:|---|
| Video/audio download | Yes | Yes | Keep Eclipse flow |
| Quality selection | All raw formats | Best stream per resolution | P1: expose codec/FPS/size without raw CLI |
| Audio formats | Backend presets | MP3, FLAC, Opus, M4A, WAV | Eclipse already broader |
| Progress, speed, ETA, cancellation | Basic process UI | SSE queue with cancellation and three-job limit | Eclipse already stronger |
| History | Logs | Local download history | Eclipse already stronger |
| Metadata and thumbnail embedding | Yes | **Yes: Archive preset** | Added with allowlisted flags |
| Manual/automatic subtitles | Download and embed | **Embed one validated language; transcript remains separate** | Added with explicit modes |
| Playlist download and item selection | Yes | No; backend enforces `--no-playlist` | P1: bounded preview, item selection and batch limits |
| Proxy | Custom proxy | Public HTTP(S)/SOCKS proxy without credentials | Keep safer Eclipse boundary |
| Custom output path/template | Yes | Browser-controlled save, isolated server temp path | Do not add server path access |
| Custom FFmpeg path | Yes | Image/container dependency | Add Dependency Doctor, not arbitrary paths |
| Custom CLI arguments | Yes | No | Intentionally rejected: command/supply-chain boundary |
| Backend auto-update | Yes, optional | Exact pinned `yt-dlp` image dependency | Keep reproducible releases |
| Rights and URL safety gates | No comparable gate | Rights confirmation, URL/proxy validation, TTL | Eclipse already stronger |

## Next bounded slice

Playlist support must not simply remove `--no-playlist`. The safe design is:

1. `POST /api/playlist/info` performs flat metadata discovery with timeout and maximum 50 items.
2. The user selects individual items; nothing downloads during discovery.
3. `POST /api/playlist/download` accepts at most 10 selected immutable video IDs and the existing
   rights confirmation.
4. Every item becomes a normal job and shares the global three-job concurrency limit, TTL,
   cancellation and audit-safe errors.
5. Private playlists, cookies, browser-session extraction and raw CLI arguments stay out of scope.

## Security result

- **Critical/High:** none introduced or accepted.
- **Fixed Medium:** `yt-dlp` now runs through the current pinned Python environment instead of
  resolving an executable through `PATH`, avoiding false dependency errors and PATH hijacking.
- **Medium, unresolved:** application URL validation cannot fully stop redirect-based SSRF or DNS
  rebinding; production still needs container egress policy.
- **Low, accepted:** some providers may not support thumbnail/subtitle embedding for every output
  container; the job fails closed with a generic error and no partial sidecars are exposed.
