# ⚡ Eclipse Media

> Self-hosted медиа-загрузчик | React 19 + TypeScript + FastAPI + yt-dlp

Скачивай видео и аудио с YouTube, TikTok, Instagram, Twitter и ещё 1000+ сайтов — локально, без рекламы, бесплатно.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## Возможности

- Скачивание MP4 (с выбором качества) и MP3
- Реальный прогресс через Server-Sent Events
- Массовая загрузка — несколько ссылок одновременно
- Авто-дедупликация URL
- История загрузок (localStorage)
- Авто-удаление файлов через 1 час (TTL)
- Превью: thumbnail, название, длительность, автор
- Отдельная release-video студия: брендовый template, browser preview и offline contract check;
  HyperFrames check/render работают через проверенный exact CLI и воспроизводимый lockfile

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
| **Torlink** | Только reference для CLI UX, очередей загрузки и source health-check. Не превращать Eclipse Media в публичный downloader "любых файлов"; тестировать только legal/open-data сценарии |

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

## Быстрый старт

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
