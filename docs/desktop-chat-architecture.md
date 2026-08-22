# Eclipse Media Desktop + Eclipse Chat

Последнее обновление: **23.08.2026**

## Решение

Eclipse Media остаётся отдельным **local-first desktop worker**, а Eclipse Chat становится
не местом хранения больших файлов, а опциональным **control plane**: создать задачу, получить
статус, провести human approval и принять receipt.

Это лучше единого web-сервиса: скачивание, FFmpeg, native save dialog и сотни мегабайт данных
остаются на устройстве; Chat не получает cookies, временные stream URL и локальные пути.

## Целевая архитектура

1. **Eclipse Media Desktop Shell** — Tauri 2, существующий React UI, native window, tray,
   системные уведомления, save dialog и подписанные обновления.
2. **Media Core** — существующий FastAPI/yt-dlp/FFmpeg sidecar на loopback с динамическим портом,
   session token, bounded queue, cancellation и cleanup.
3. **Local Job Store** — SQLite только для metadata/status/receipts; медиафайлы не попадают в БД.
4. **Eclipse Chat Media Adapter** — создаёт только versioned job draft, показывает preview/diff
   и требует human approval перед передачей в локальный worker.
5. **Receipt Channel** — возвращает в Chat allowlisted результат: job ID, source host, выбранный
   формат, timestamps, status, размер и hash. Локальный path и stream URL исключены.

## Контракты

- `eclipse.media-job.v1`: public HTTPS source, intent, quality ID, rights confirmation,
  optional project ID, created-by и approval state.
- `eclipse.media-progress.v1`: `preparing | downloading | processing | finalizing | done | error`,
  percent, speed, ETA и fragment counters без raw command/output.
- `eclipse.media-receipt.v1`: immutable bounded summary и SHA-256 готового файла.

Chat не получает права самостоятельно скачивать, публиковать, отправлять или удалять файл.
Каждая новая authority остаётся отдельным approval.

## UX desktop

- Закрытие окна не обрывает задачу: worker остаётся в tray.
- На каждом этапе видны человеческий статус, progress/fragment count и действие «Остановить».
- После готовности появляется native save dialog и системное уведомление.
- При перезапуске незавершённые задачи показываются как interrupted с безопасным retry, а не
  автоматически продолжаются.
- Для длинных HLS-роликов заранее показываются ориентировочный размер/время, когда источник
  предоставляет достаточно metadata; неподтверждённые оценки маркируются как приблизительные.

## Security boundary

- Loopback API недоступен из LAN и требует случайный session token от desktop shell.
- URL validation, DNS/IP checks, redirect allowlists, rights gate и concurrency limits сохраняются.
- Cookies аккаунтов, OAuth, client data, arbitrary CLI arguments и autonomous publication запрещены.
- Tauri allowlist минимальна: native save dialog, notifications и lifecycle; shell execution доступен
  только закреплённому Media Core sidecar.
- Release artifacts подписываются; updater принимает только подписанный manifest и rollback build.

## Rollout

### P0 — текущий web-desktop bridge

- Честные фазы long-running job, HLS fragments, progress и finalization feedback.
- Launcher сверяет runtime version; stale backend не переиспользуется.
- Cancellation и partial-file cleanup становятся обязательным regression gate.

### P1 — Tauri desktop MVP (L)

- **Pilot реализован:** существующий React UI и PyInstaller Media Core упакованы в Tauri 2.
- **Pilot реализован:** dynamic loopback port, environment-only session token, native save dialog,
  tray, notifications, single-instance lock и graceful sidecar shutdown.
- **Открытый release gate:** production code signing, signed updater manifest и rollback build.
  Локальный NSIS pilot остаётся unsigned и не считается production distribution.

### P2 — Eclipse Chat adapter (L)

- Versioned draft/approval/progress/receipt contracts.
- Pairing по одноразовому local code; без cloud tunnel по умолчанию.
- Growth Command Room получает ссылку на receipt, но не медиафайл.

### P3 — managed workstation mode (XL)

- Несколько доверенных workers, RBAC, audit log и policy packs для команды.
- Только после отдельного privacy/DPA/threat-model review.

## Следующий vertical slice

Провести ручной acceptance нативного окна на одном разрешённом публичном test asset: проверить
длинный HLS progress, закрытие в tray, notification и native save dialog. После acceptance —
зафиксировать `eclipse.media-job/progress/receipt.v1` и реализовать read-only Eclipse Chat adapter
без cloud tunnel, файлов, cookies, stream URL и локальных путей.
