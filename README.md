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
  HyperFrames lint/validate/render включаются только после exact CLI audit и lockfile

## Product radar

Источник: [Eclipse Library · July 2026 project integration](https://library.eclipse-forge.ru/#guide/july-2026-project-integration).

| Reference | Как использовать |
|-----------|------------------|
| **Google image/video low-cost tier** | Проверить как дешёвый provider для генерации/редактирования preview, thumbnails, short clips и видео-ассетов вокруг скачанного контента |
| **Seed-Audio 1.0** | Reference для озвучки/диалогов и voiceover-пайплайнов. Voice cloning только с явным согласием |
| **Voicetypr / Audio Transcriber** | Локальная/веб-транскрибация: видео/аудио → transcript → summary → action clips |
| **Sokuji** | Live translation / virtual microphone pattern для будущего режима “перевести ролик/созвон”; только consent-safe сценарии |
| **ChatCut / MaxFusion / video-use** | Workflow benchmark: очистка речи, субтитры, motion inserts, variants, project memory. Не core dependency до API/privacy/pricing review |
| **HyperFrames** | **P0 в работе:** готова HTML/GSAP-композиция `Eclipse Release Signal`, preview в UI и fail-closed local runner под официальный tag `v0.7.88`. CLI ещё не установлен: npm registry недоступен, package integrity/lockfile и реальный render остаются обязательным gate |
| **Torlink** | Только reference для CLI UX, очередей загрузки и source health-check. Не превращать Eclipse Media в публичный downloader "любых файлов"; тестировать только legal/open-data сценарии |

## Release-video pipeline

Открой в приложении раздел **«Видео-студия»**. Основной путь виден сразу:

1. Нажми **«Открыть предпросмотр»** и просмотри все пять сцен.
2. Запусти offline contract check — он проверяет timing, exact GSAP SRI и отсутствие скрытого `npx`:

```bash
cd frontend/public/studio/eclipse-release
npm run check
```

3. После восстановления npm registry проверь metadata/integrity пакета `@hyperframes/cli@0.7.88`,
   добавь exact devDependency и commit `package-lock.json`. Затем выполни полный gate:

```bash
npm run verify
npm run render
```

Файл появится в `frontend/public/studio/eclipse-release/renders/eclipse-release.mp4`.
До появления проверенной локальной зависимости команды `verify` и `render` завершаются fail closed
и ничего не скачивают. Для CLI нужны Node.js 22+ и FFmpeg. Публикация остаётся ручным действием
после просмотра результата.

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
