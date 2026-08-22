# ⚡ Eclipse Media

> Self-hosted медиа-загрузчик | React 19 + TypeScript + FastAPI + yt-dlp

Планируй, проверяй и обрабатывай разрешённые медиаисточники локально: видео, аудио, транскрипты и release-ролики в одном понятном workflow.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## Возможности

- Media Intake: ссылка → цель → проект → локальная очередь → одно следующее действие
- Обязательное подтверждение прав перед скачиванием и транскрипцией
- Скачивание MP4 (с выбором качества) и MP3
- Прямые публичные VK/VKVideo-ролики с внешним OK.ru источником: без cookies и OAuth
- Archive preset: metadata и thumbnail в итоговом файле
- Встраивание авторских или автоматических субтитров выбранного языка
- Реальный прогресс через Server-Sent Events
- Массовая загрузка — несколько ссылок одновременно
- Авто-дедупликация URL
- История загрузок (localStorage)
- Авто-удаление файлов через 1 час (TTL)
- Превью: thumbnail, название, длительность, автор
- Отдельная release-video студия: брендовый template, browser preview и offline contract check;
  HyperFrames check/render работают через проверенный exact CLI и воспроизводимый lockfile
- Локальная проверка `eclipse.release-storyboard.v1` из Shotforge до render без загрузки, shell и side effects

## Product radar

Источник: [Eclipse Library · July 2026 project integration](https://library.eclipse-forge.ru/#guide/july-2026-project-integration).

| Reference | Как использовать |
|-----------|------------------|
| **Google image/video low-cost tier** | Проверить как дешёвый provider для генерации/редактирования preview, thumbnails, short clips и видео-ассетов вокруг скачанного контента |
| **Seed-Audio 1.0** | Reference для озвучки/диалогов и voiceover-пайплайнов. Voice cloning только с явным согласием |
| **Voicetypr / Audio Transcriber** | Локальная/веб-транскрибация: видео/аудио → transcript → summary → action clips |
| **Sokuji** | Live translation / virtual microphone pattern для будущего режима “перевести ролик/созвон”; только consent-safe сценарии |
| **ChatCut / MaxFusion / video-use** | Workflow benchmark: очистка речи, субтитры, motion inserts, variants, project memory. Не core dependency до API/privacy/pricing review |
| **HyperFrames** | **P0 готов:** HTML/GSAP-композиция `Eclipse Release Signal`, preview в UI, fail-closed runner и exact `hyperframes@0.7.88` с lockfile. Runtime/layout/motion/WCAG gate и реальные `16:9`, `9:16`, `1:1` renders подтверждены локально |
| **YTSage** | Clean-room reference для format picker, истории, subtitles и понятного download UX. Код не импортируется; network actions проходят через rights gate и SSRF validation |
| **Reiverr** | Только clean-room product reference для единой очереди discover/request/watch. AGPL-код не копируется в MIT-проект |
| **Torlink** | Только reference для CLI UX, очередей загрузки и source health-check. Не превращать Eclipse Media в публичный downloader "любых файлов"; тестировать только legal/open-data сценарии |

## Media Intake

Открой раздел **«План»** и выбери ожидаемый результат: посмотреть источник, скачать видео,
извлечь аудио или получить транскрипт. Добавь проект и короткую заметку — задача сохранится
локально в браузере. Для скачивания и обработки нужно явно подтвердить права на материал.

Безопасный путь намеренно состоит из двух шагов:

1. **«Добавить в план»** сохраняет намерение и ничего не скачивает.
2. **«Подготовить …»** проверяет публичную HTTP(S) ссылку и открывает существующие настройки.

Backend блокирует localhost, private/link-local/metadata IP, URL с credentials, опасные протоколы
и private proxy endpoints. Одновременно выполняется не больше трёх загрузок; удаление активной
задачи останавливает дочерний процесс. Это application-level защита: production deployment также
должен ограничивать container egress, потому что redirects и DNS rebinding нельзя полностью
закрыть одной проверкой до запуска `yt-dlp`.

Remote runtime components `yt-dlp` выключены по умолчанию. Если конкретный extractor действительно
требует EJS с GitHub, администратор может осознанно включить его через
`ECLIPSE_MEDIA_ALLOW_REMOTE_COMPONENTS=true` после отдельного supply-chain review.

В карточке видео раздел **«Дополнительно»** предлагает только allowlisted настройки: обычный или
архивный файл и один режим субтитров. Произвольные CLI arguments, server output paths, cookies и
автоматическое обновление backend намеренно отсутствуют. Сравнение с Cube YouTube Downloader и
bounded план playlists: [`docs/youtube-dl-wpf-gap-analysis.md`](docs/youtube-dl-wpf-gap-analysis.md).

## Release-video pipeline

Открой в приложении раздел **«Видео-студия»**. Основной путь виден сразу:

1. Нажми **«Открыть предпросмотр»** и просмотри все пять сцен.
2. Запусти offline contract check — он проверяет timing, exact GSAP SRI и отсутствие скрытого `npx`:

```bash
cd frontend/public/studio/eclipse-release
npm run check
```

3. Установи exact dependencies из lockfile и выполни полный gate:

```bash
npm ci
npm run verify
npm run render
```

Основной файл появится в `frontend/public/studio/eclipse-release/renders/eclipse-release-16x9.mp4`.
Для соцсетей доступны `npm run render:vertical` и `npm run render:square`.
Runner завершается fail closed, если локальная версия CLI отсутствует или отличается от `0.7.88`.
Для CLI нужны Node.js 22+ и FFmpeg. Публикация остаётся ручным действием после просмотра результата.

Композиция не загружает runtime из CDN. Exact GSAP `3.14.2` хранится локально; SHA-256 и
SHA-384 SRI проверяются offline, а байты сверены с официальным GitHub tag. GSAP использует
отдельную GreenSock “no charge” license (не MIT/Apache); copyright header сохранён.


## MiniMax Music 3 benchmark

Eclipse Media now has a reproducible, dry-run-first benchmark plan in
backend/minimax_music3_benchmark.py. It does not download the model, execute remote code,
or contact a cloud provider. Supply an exact 40-character Hugging Face commit revision:

    cd backend
    python minimax_music3_benchmark.py --revision <PINNED_COMMIT_SHA>

The three initial cases cover a release cue, tabletop ambience, and original Russian vocal
clarity without copyrighted lyrics, named-artist imitation, or voice cloning. Execution is
separate and requires every approval flag plus an isolated loopback runner:

    python minimax_music3_benchmark.py --revision <PINNED_COMMIT_SHA> --execute \
      --accept-license --confirm-rights --confirm-no-sensitive-input \
      --confirm-no-voice-impersonation

The runner URL is fixed to loopback HTTP with the exact /v1/music/generate path. Tokens come
only from ECLIPSE_MEDIA_BENCHMARK_TOKEN and are never printed. Responses are capped at 1 MiB
and may return only bounded metrics and an asset SHA-256; raw audio, paths, and URLs are not
stored in the benchmark report. Redirects are rejected so credentials remain inside the
validated loopback boundary. A real quality/latency result still requires a separately
audited runner, compatible hardware, verified model terms, and manual listening review.

## Быстрый старт

### Windows — один файл

Для обычного запуска дважды нажмите `Eclipse Media.exe` в корне проекта или ярлык
`Eclipse Media` на рабочем столе. Это автономный Windows x64 launcher: установленный
.NET Runtime ему не нужен, а пользовательские аргументы не передаются в PowerShell.

Чтобы пересобрать EXE из проверяемого исходного кода и заново установить ярлык:

```powershell
.\Build-Eclipse-Media-Exe.ps1
.\Install-Eclipse-Media-Shortcut.ps1
```

`Eclipse Media.cmd` остаётся прозрачным fallback-вариантом. Оба launcher-сценария:

- проверяют Node.js 22+, Python 3.11+ и FFmpeg;
- создают изолированный `backend/.venv` и устанавливают pinned backend dependencies только при изменении `requirements.txt`;
- устанавливают frontend dependencies через `npm ci --ignore-scripts` только при изменении lockfile;
- запускают API и интерфейс только на `127.0.0.1`, открывают браузер и останавливают созданные процессы по Enter.

Если порты `8000` или `5173` заняты другим приложением, запуск завершится с понятной ошибкой,
не подключаясь к чужому процессу. Диагностические логи сохраняются локально в `.runtime/` и не
попадают в Git.

Локально собранный EXE не подписан коммерческим code-signing сертификатом, поэтому Windows
SmartScreen может показать предупреждение. Исходный launcher находится в `launcher/`, а сборка
не использует сторонние EXE-packers.

### Docker (рекомендуется)

```bash
git clone https://github.com/PavelHopson/eclipse-media.git
cd eclipse-media
docker compose up --build
```

Открой **http://localhost:5173**

### Локально

**Backend:**
```bash
cd backend
pip install -r requirements.txt
# Установи ffmpeg: brew install ffmpeg / apt install ffmpeg
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Стек

| Часть | Технологии |
|-------|-----------|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS 4 · Zustand |
| Backend | Python · FastAPI · yt-dlp · Server-Sent Events |
| Инфра | Docker · ffmpeg |

## Улучшения над оригинальным Reclip

| Reclip | Eclipse Media |
|--------|--------------|
| Flask | FastAPI |
| Polling статуса | SSE (реальный прогресс) |
| Файлы не удаляются | TTL 1 час + фоновая очистка |
| Один URL за раз | Массовая загрузка |
| Нет истории | История в localStorage |
| Vanilla JS | React 19 + TypeScript + Zustand |

## Лицензия

[MIT](LICENSE)

---

<div align="center">
<sub>Сделано в Eclipse Forge</sub>
</div>
## Eclipse Forge visual contract

Eclipse Media uses the local `eclipse-forge.visual-system.v1` snapshot in the `product` profile: self-hosted Outfit/Inter, signal-blue actions, warm-gold highlights, subtle grid depth and reduced-motion-safe transitions. Operational rights gates and queue states remain visually dominant over decoration.

## Production deployment

Production uses docker-compose.production.yml: the frontend is built once and served by a
non-root NGINX container, the FastAPI backend runs as a non-root user, both containers drop Linux
capabilities and use read-only filesystems, and only the frontend is bound to host loopback.

The Deploy production workflow is manual, master-only and attached to the protected GitHub
production environment. Configure DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, DEPLOY_SSH_KEY and
DEPLOY_KNOWN_HOSTS as environment secrets; optionally set ECLIPSE_MEDIA_PORT as an environment
variable. DEPLOY_PATH must be below /opt or /srv. The workflow verifies tests and images before SSH,
uses the supplied known_hosts entry, activates an immutable commit release, checks /api/health and
restores the previous release on failure. Reverse proxy and public TLS stay outside this repository.
