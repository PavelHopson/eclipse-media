# Eclipse Media Roadmap

Последнее обновление: **12.08.2026**

## P0

- [x] Add a manual production deployment gate with a protected GitHub environment, pinned actions,
      strict SSH host verification, non-root/read-only containers, loopback-only exposure,
      pre-deploy test/build checks, health verification and rollback.

- [x] Добавить Media Intake: четыре понятных результата, project context, заметки и локальную очередь.
- [x] Добавить rights gate, public URL/proxy validation, максимум три активные задачи и process cancellation.
- [x] Закрепить `yt-dlp==2026.3.17`; remote EJS components сделать opt-in, а CI actions — SHA-pinned.
- [x] Добавить HyperFrames-ready release-video workspace с browser preview и offline contract check.
- [x] Вынести видео-студию в отдельный понятный режим web UI и адаптировать desktop/mobile layout.
- [x] Добавить CDN-free fallback, чтобы preview не превращался в чёрный экран при сетевом сбое.
- [x] Удалить runtime CDN; exact GSAP 3.14.2 хранить локально, проверять SHA-256 + SHA-384 SRI
      после byte-for-byte сверки с официальным GitHub tag.
- [x] Заменить implicit `npx --yes` на fail-closed local runner: exact package name/version,
      path containment и `shell: false`; добавить offline timing/SRI/supply-chain contract test.
- [x] Добавить local-first Desktop Creator Kit: ShareX local-only, QuickLook без plugins,
      Everything без servers/history и FocuSee только для public-demo benchmark.
- [x] Проверить metadata/integrity/signatures `hyperframes@0.7.88`, добавить exact devDependency +
      lockfile и подтвердить unified `check` и реальный 1080p render.
- [ ] Добавить editable release brief и безопасную генерацию composition variables без shell interpolation.
- [x] Добавить fail-closed импорт `eclipse.release-storyboard.v1` из Shotforge и локальный preview текста без shell/render side effects.
- [ ] Добавить локальный render queue с size/time limits, cancellation и redacted operation audit.
- [x] Восстановить frontend lint gate: ESLint, TypeScript и React rules закреплены exact
      devDependencies с lockfile; `npm run lint` снова является воспроизводимым quality gate.

## P1

- [ ] Добавить server-side request queue с пользователями, ролями и audit trail; текущая очередь local-only.
- [ ] Добавить container egress policy и redirect-aware network isolation поверх application SSRF checks.
- [ ] PR/roadmap -> storyboard draft через Eclipse Chat approval flow.
- [ ] Asset library с provenance, consent и commercial-rights metadata.
- [x] Добавить детерминированные 9:16 и 1:1 варианты release-template с общей Eclipse design system.
- [x] Разнести пять release-сцен по sub-compositions, чтобы упростить timeline diff и Studio editing.

## P2

- [ ] Подключить Eclipse AI Hub Model Registry для image/video/voice providers.
- [ ] Добавить transcript-first video understanding с timestamps и citations.
- [x] Добавить dry-run MiniMax Music 3 benchmark с pinned revision, rights/license/biometric gates и loopback-only runner.

## Changelog
### 2026-08-17 - MiniMax Music 3 benchmark contract

- Added three original, bounded music-generation cases and a deterministic dry-run plan.
- Live execution now fails closed without a pinned commit, model-license acceptance, rights confirmation,
  sensitive-input and voice-impersonation attestations, plus an exact loopback runner endpoint.
- Runner redirects are rejected and response length, metrics, duration and sample rate are bounded before reporting.
- Reports keep only allowlisted quality metrics and asset hashes. No model code, remote runner, raw audio,
  token, URL, or local path is pulled into the repository by the benchmark command.
- Fourteen backend tests pass. A real model run remains pending audited hardware/runtime and terms review.
### 2026-08-13 - production deployment foundation

- Added immutable source-archive deployment behind workflow_dispatch and the protected production environment.
- Production containers run non-root with dropped capabilities and read-only roots; the app binds to loopback for an external TLS proxy.
- SSH host trust comes only from the configured known_hosts secret. Activation requires a healthy API and restores the previous release on failure.
- Local Docker validation was unavailable on this Windows host; the workflow performs compose validation and image builds before any SSH step.

### 2026-08-13

- Release Studio now validates metadata-only `eclipse.media-asset.v1` sidecars from Text2Image locally.
- The contract rejects URLs, paths, unknown fields, unsupported image formats and missing rights approval.
- The image binary is never embedded, fetched or uploaded; the operator selects the matching local image manually.
- Added responsive empty/error/success preview plus two security regression tests. Typecheck, lint and production build pass.

### 2026-08-12

- Восстановлен frontend lint gate: добавлен flat ESLint config для TypeScript/React, исправлены
  обнаруженные правила hooks и error chaining; lint, build и dependency audit проходят локально.
- Desktop Creator Kit создаёт versioned `eclipse.creator-capture-plan.v1` только локально в браузере.
  План не устанавливает и не запускает приложения, не читает файлы и не включает cloud upload.
- Экспорт блокируется без rights confirmation, при наличии секретов/клиентских данных и при попытке
  выбрать FocuSee для internal content. Auto-upload, plugins, network server и history закреплены `false`;
  публикация всегда требует отдельного ручного подтверждения.
- Импорт плана из Shotforge ограничен 32 KB, exact schema/tool allowlist и fail-closed controls.

- Release Studio принимает JSON-контракт Shotforge только локально в браузере: размер ограничен
  64 KB, схема и поля allowlisted, timeline фиксирован пятью трёхсекундными сценами.
- Unknown fields, новая schema version, другой timing и отсутствие manual approval блокируются.
  Импорт не запускает HyperFrames, shell, network, render или публикацию.
- Добавлен понятный empty/error/success preview и mobile/reduced-motion layout. Подтверждённый
  текст пока переносится в composition вручную; безопасная генерация variables остаётся отдельным этапом.


### 2026-08-05

- Добавлен clean-room Media Intake по полезным UX-паттернам YTSage/Reiverr: watch/video/audio/transcript,
  project context, заметки, local queue, понятные статусы и одно следующее действие без автономной публикации.
- Скачивание и транскрипция теперь требуют явного rights confirmation на frontend и backend.
  HTTP(S)/proxy validation блокирует credentials, localhost, private/link-local/metadata destinations;
  job IDs используют полный UUID, concurrency ограничена тремя задачами, удаление останавливает процесс.
- Supply-chain boundary усилена: `yt-dlp` закреплён exact version, remote EJS runtime выключен по
  умолчанию, CI actions закреплены по commit SHA и backend regression tests включены в обязательный gate.
- Внешний Google Fonts import удалён: UI использует локальный системный font stack без third-party request.

### 2026-08-03

- Пять release-сцен вынесены в самостоятельные HyperFrames sub-compositions с локальными paused
  GSAP timelines. Host, internal и timeline IDs защищены cross-file contract test; format builder
  создаёт согласованные 16:9, 9:16 и 1:1 scene variants без network/shell input.

### 2026-08-02

- Через session-only SSH SOCKS5 восстановлен доступ к npm registry. Публичный пакет
  `hyperframes@0.7.88` сверен с официальным tag/commit, закреплён exact dependency и lockfile;
  npm signatures/attestations подтверждены, audit: 0 vulnerabilities.
- HyperFrames pipeline переведён на directory-based CLI contract и unified `check`. Исправлены
  WCAG contrast и конфликтующие scale tweens; runtime, layout, motion и 38/38 contrast checks прошли.
  Реальные H.264 renders подтверждены: 1920x1080, 1080x1920 и 1080x1080, 30 fps, 15 секунд.
- Добавлен deterministic format builder без shell/network interpolation. `render:landscape`,
  `render:vertical` и `render:square` используют одну source composition и прошли visual QA.
- Подготовлен первый HyperFrames-ready pipeline: 15-секундная Eclipse-композиция на
  HTML/CSS/paused GSAP, browser preview и offline contract check.
- Web UI получил раздел «Видео-студия» с одним главным действием, трёхшаговым runbook,
  copyable commands, CDN-free fallback, keyboard focus и reduced-motion/mobile states.
- Security boundary: runtime CDN удалён, GSAP 3.14.2 vendored и защищён SHA-256 + SRI,
  query forwarding удалён, implicit `npx` запрещён. Runner принимает только локальный exact CLI,
  не использует shell/network fallback и требует human review до внешней публикации.
- License boundary: Apache-2.0 HyperFrames и GreenSock “no charge” license GSAP учитываются
  отдельно; copyright notice vendored runtime сохранён.
## Visual contract pilot — 2026-08-12

- [x] Add the local product token snapshot and self-hosted Outfit/Inter with OFL notices.
- [x] Align secondary/muted text and warm-gold accents with the Landing contract.
- [x] Add one restrained gold/blue ambient anchor and focus treatment without changing media rights or queue behavior.
- [x] Pass frontend typecheck and production build.
