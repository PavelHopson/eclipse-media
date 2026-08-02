# Eclipse Media Roadmap

Последнее обновление: **02.08.2026**

## P0

- [x] Добавить HyperFrames-ready release-video workspace с browser preview и offline contract check.
- [x] Вынести видео-студию в отдельный понятный режим web UI и адаптировать desktop/mobile layout.
- [x] Добавить CDN-free fallback, чтобы preview не превращался в чёрный экран при сетевом сбое.
- [x] Удалить runtime CDN; exact GSAP 3.14.2 хранить локально, проверять SHA-256 + SHA-384 SRI
      после byte-for-byte сверки с официальным GitHub tag.
- [x] Заменить implicit `npx --yes` на fail-closed local runner: exact package name/version,
      path containment и `shell: false`; добавить offline timing/SRI/supply-chain contract test.
- [x] Проверить metadata/integrity/signatures `hyperframes@0.7.88`, добавить exact devDependency +
      lockfile и подтвердить unified `check` и реальный 1080p render.
- [ ] Добавить editable release brief и безопасную генерацию composition variables без shell interpolation.
- [ ] Добавить локальный render queue с size/time limits, cancellation и redacted operation audit.
- [ ] Восстановить frontend lint gate после доступности npm registry: добавить ESLint/config как exact
      devDependencies с lockfile. Текущий исторический script `eslint .` не имеет объявленного пакета/config.

## P1

- [ ] PR/roadmap -> storyboard draft через Eclipse Chat approval flow.
- [ ] Asset library с provenance, consent и commercial-rights metadata.
- [x] Добавить детерминированные 9:16 и 1:1 варианты release-template с общей Eclipse design system.
- [ ] Разнести пять release-сцен по sub-compositions, чтобы упростить timeline diff и Studio editing.

## P2

- [ ] Подключить Eclipse AI Hub Model Registry для image/video/voice providers.
- [ ] Добавить transcript-first video understanding с timestamps и citations.

## Changelog

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
