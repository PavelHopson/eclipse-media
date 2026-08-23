# Eclipse Media Roadmap

Последнее обновление: **23.08.2026**

## P0

- [x] Add a manual production deployment gate with a protected GitHub environment, pinned actions,
      strict SSH host verification, non-root/read-only containers, loopback-only exposure,
      pre-deploy test/build checks, health verification and rollback.

- [x] Добавить Media Intake: четыре понятных результата, project context, заметки и локальную очередь.
- [x] Добавить rights gate, public URL/proxy validation, максимум три активные задачи и process cancellation.
- [x] Закрепить `yt-dlp==2026.7.4`; remote EJS components сделать opt-in, а CI actions — SHA-pinned.
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
- [x] Перестроить главный download workspace вокруг одного сценария «ссылка → проверка → права → файл»
      и добавить Windows one-click launcher без Docker-зависимости.

## P1

- [x] Собрать Tauri 2 desktop MVP: native window/save dialog/tray/notifications, single-instance,
      unsigned NSIS pilot и loopback Media Core sidecar с динамическим портом/session token.
- [ ] Добавить production code signing, подписанный updater manifest и проверенный rollback build;
      pilot installer нельзя называть доверенным/подписанным до получения сертификата.
- [ ] Добавить Eclipse Chat Media Adapter через `eclipse.media-job/progress/receipt.v1` с preview,
      human approval и без передачи файлов, cookies, stream URL или локальных путей в Chat.
- [ ] Добавить bounded playlist preview и выбор до 10 элементов без cookies/raw CLI; все элементы
      проходят общий rights gate, очередь максимум из трёх jobs, TTL и cancellation.
- [ ] Расширить format picker проверяемыми codec/FPS/filesize, не раскрывая raw yt-dlp expressions.
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
### 2026-08-23 - branded Windows installer (v1.3.1)

- NSIS welcome/finish приведены к общей Eclipse Media visual system: signal blue, warm gold,
  dark local-first surface, новый различимый media mark и фирменный sidebar `164x314`.
- Добавлены отдельные header/uninstaller header `150x57`, app/installer/uninstaller icons и
  воспроизводимый PowerShell generator; root desktop build регенерирует branding через pinned
  local Tauri CLI до сборки NSIS.
- Сохранены native Windows controls, keyboard focus, language selector, current-user install и
  явный desktop-shortcut choice; preview QA выполнен без установки и без изменений registry/AppData.
- Собран unsigned pilot `Eclipse Media_1.3.1_x64-setup.exe`; code signing остаётся открытым P1 gate,
  поэтому SmartScreen trust не заявляется как решённый.

### 2026-08-23 - native local-first desktop pilot (v1.3.0)

- Добавлен Tauri 2 shell с native window, tray lifecycle, single-instance mutex, уведомлением и
  Windows save dialog; браузерный launcher остаётся fallback, а не маскируется под desktop app.
- FastAPI/yt-dlp упаковывается PyInstaller sidecar и запускается только на случайном loopback-порту.
  Случайный session token передаётся через environment, не URL/argv/storage/logs; запросы без него
  получают `401`, а Tauri window не имеет произвольного shell/API capability.
- Desktop сохраняет файл потоково во временный файл с лимитом 16 ГБ и проверяет job ID/filename;
  Chat, webview и уведомление не получают локальный путь.
- Зафиксированы Tauri CLI/Cargo зависимости, строгий CSP и собственная Eclipse Forge icon set.
  Один root build script собирает sidecar и NSIS pilot; production signing/updater остаются
  отдельным незакрытым gate.

### 2026-08-22 - observable long downloads and desktop direction (v1.2.3)

- Long-running download получил явные фазы `preparing`, `downloading`, `processing`, `finalizing`;
  100% больше не выглядит как зависание во время локальной обработки.
- HLS progress parser поддерживает приблизительный total, unknown ETA и fragment counters; UI
  показывает текущий фрагмент и честно предупреждает о нескольких минутах обработки длинного ролика.
- Зафиксировано product-решение: Eclipse Media развивается как Tauri local-first desktop worker,
  Eclipse Chat — как approval/control plane без передачи больших файлов и приватных runtime-данных.
- Архитектура, контракты, security boundary и P0–P3 rollout описаны в
  `docs/desktop-chat-architecture.md`.

### 2026-08-22 - authoritative download filenames (v1.2.2)

- Имя сохранённого файла теперь берётся из фактического `yt-dlp` extractor result после обработки,
  а не из потенциально устаревшего `title` карточки frontend.
- Frontend больше не отправляет title как источник имени; client value оставлен на backend только
  как backward-compatible fallback для старых клиентов.
- Filename sanitation удаляет control/Windows-invalid characters, trailing dots/spaces и защищает
  зарезервированные имена `CON`, `NUL`, `COM1` и аналоги.
- Windows launcher больше не содержит hardcoded `1.2.0`: expected version читается из package
  metadata, а уже запущенный устаревший backend получает понятное действие вместо молчаливого reuse.
- Регрессия имитирует client title «Первый ролик» и extractor title «Второй ролик»; итоговое имя
  подтверждено как `Второй ролик.mp4`. Bounded real extractor check сохранил progress и вернул
  фактический JSON-encoded title после merge.
- Exact `ok.ru/video/1656642341511` проверен через обновлённый localhost API: metadata доступна,
  реальная bounded-задача дошла до HLS fragment 10 и была вручную отменена; полный файл не скачивался.

### 2026-08-22 - VK external OK.ru resolver (v1.2.1)

- Прямые публичные ссылки `vk.com/video<owner>_<id>` и `vkvideo.ru/video<owner>_<id>` теперь
  проверяются через фиксированные официальные VK endpoints; внешний OK.ru embed передаётся
  существующему закреплённому `yt-dlp` extractor вместо устаревшего `player.params`.
- Resolver не использует cookies, OAuth или пользовательские аккаунты: анонимный read-only token
  хранится только в памяти вызова, не логируется и не сохраняется; app secret в коде отсутствует.
- Внешний переход ограничен HTTPS-хостами `ok.ru` / `www.ok.ru` и путём
  `video(embed)/<digits>`; redirects, ответы и cache имеют фиксированные allowlist/limits.
- Exact regression `video-168673382_456239188` разрешается в публичный OK embed `1903142701709`;
  metadata показывает 144p–720p, bounded `yt-dlp --test` успешно получил и объединил по 10 KiB
  video/audio. Полный пользовательский файл в проверке не скачивался.

### 2026-08-22 - actionable VK download recovery

- Обновлён exact stable pin `yt-dlp==2026.7.4`; nightly/master и remote components не включались.
- FastAPI обновлён до exact `0.141.1`, чтобы убрать известные advisories транзитивного Starlette;
  совместимость подтверждается полным backend regression gate и `pip-audit`.
- Выбранный VK-поток теперь допускает безопасный fallback на тот же combined format до общего `best`.
- Ошибки проверки и загрузки преобразуются в bounded actionable сообщения без URL query tokens и
  raw extractor output; error card получила явное действие «Обновить данные».
- Профили и каналы VK остаются неподдерживаемыми из-за upstream cursor extractor failure;
  рабочим входом остаётся прямая публичная ссылка на отдельный ролик.
- Для OK.ru закреплён Mozilla CA bundle `certifi==2026.7.22`: progressive MP4 больше не падает
  с `CERTIFICATE_VERIFY_FAILED`; TLS validation остаётся обязательной и никогда не отключается.

### 2026-08-22 - guided download workspace and Windows launcher

- Главный экран получил явную иерархию, трёхшаговый flow, отдельную очередь и компактную
  local/privacy-панель; ввод URL теперь показывает inline validation и ограничен десятью ссылками.
- Mobile layout удерживает поле и CTA в первом экране, а desktop использует спокойную двухколоночную
  product-композицию без горизонтального overflow.
- Добавлен `Eclipse Media.cmd` с PowerShell launcher: isolated venv, lockfile-aware bootstrap,
  loopback-only API/UI, проверка занятых портов, локальные логи и cleanup принадлежащих launcher процессов.
- Добавлен воспроизводимый автономный `Eclipse Media.exe` для Windows x64 без стороннего packer:
  он запускает только соседний проверенный PowerShell-сценарий, не принимает внешние аргументы и
  устанавливает явный desktop-ярлык отдельной обратимой командой.

### 2026-08-22 - bounded archive download preset

- Clean-room comparison with GPLv3 Cube YouTube Downloader documented the real parity and gaps.
- Added an allowlisted Archive preset for embedded metadata and thumbnail plus explicit manual/auto
  subtitle embedding for one validated language.
- Raw CLI arguments, arbitrary server paths, cookies and backend auto-update remain forbidden;
  unknown API fields and subtitle argument injection fail closed.
- Backend launches the pinned `yt_dlp` module through its current Python runtime instead of trusting
  an executable resolved from `PATH`.
- Removed paste-triggered auto-submit that could race the visible button and enqueue the same URL twice.
- Playlist selection and richer codec/FPS/filesize discovery are separated into bounded P1 slices.

### 2026-08-20 - preview-first AI video ads

- Added strict local import for `eclipse.video-ad-plan.v1` with a fixed 15-second timeline and unknown-field rejection.
- The UI covers empty, loading, error, ready, approved and disabled states and requires three manual review checks.
- Import and approval never invoke a network request, renderer, shell command or publisher; final publication remains separately gated.

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

### 2026-08-20 - video ad plan browser acceptance

- Real Edge/Playwright acceptance passes at 1440x900 and 390x844 for local plan import, deterministic
  three-scene preview, all three manual checks and render-preparation approval.
- Keyboard focus, reduced motion, horizontal overflow, console errors, page errors and failed requests
  were checked in both viewports; render approval remains separate from publish approval.

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

## Bento spatial profile — 2026-08-22

- [x] Assign the `bento-spatial` profile to media workspaces: compact functional groups, bounded depth and one ambient light source.
- [x] Keep rights, queue and approval boundaries unchanged; added motion is pointer-only and disabled for reduced motion.
- [x] Pass frontend typecheck, four security-contract tests and production build.
