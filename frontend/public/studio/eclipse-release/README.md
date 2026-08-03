# Eclipse Release Signal

15-секундная HyperFrames-ready композиция для release announcements, roadmap updates и
коротких product teasers Eclipse Forge. Browser preview, unified quality gate и локальный MP4 render
работают через проверенный exact dependency и lockfile.

## Быстрый старт

Для preview достаточно запущенного frontend Eclipse Media. Полный pipeline требует Node.js 22+ и FFmpeg:

```powershell
cd frontend/public/studio/eclipse-release
npm ci
npm run verify
npm run render
```

`verify` проверяет пять scene windows, cross-file mount contract, совпадение composition/timeline ID,
общую длительность, SHA-256 и SRI локальной exact-копии GSAP, deterministic guards, runtime,
layout, motion и WCAG contrast. `render` создаёт
`renders/eclipse-release-16x9.mp4`.

Дополнительные форматы используют ту же source composition и создаются детерминированно:

```powershell
npm run render:vertical # renders/eclipse-release-9x16.mp4
npm run render:square   # renders/eclipse-release-1x1.mp4
```

Целевой CLI закреплён на опубликованном пакете `hyperframes@0.7.88`, официальном tag `v0.7.88` и commit
`74fadf69c464c0e0658bd7a6b740986fc3aceba8`. Package metadata/integrity, npm signatures,
attestations и audit проверены перед фиксацией lockfile. Если exact CLI не установлен или версия
отличается от `0.7.88`, runner завершится fail closed.
Не запускайте template с production secrets или закрытыми клиентскими материалами.

## Как менять ролик

1. Обновите текст, стиль или локальный timeline в нужном файле `compositions/scene-*.html`.
2. Не переносите `<style>`, markup или `<script>` за пределы `<template>`: HyperFrames монтирует
   только содержимое template.
3. Если меняете ID сцены, синхронно обновите `data-composition-id` host-слота в `index.html`,
   внутренний `data-composition-id` и ключ `window.__timelines[...]`.
4. Если меняете длительность сцены, пересчитайте `data-start` следующих host-слотов и общий
   `data-duration` у `#stage`.
5. Для входов используйте `gsap.fromTo()`, чтобы seek назад оставался детерминированным.
6. Не используйте `Date.now()`, `Math.random()`, `repeat: -1` или wall-clock logic.
7. После каждой правки выполняйте `npm run verify`, затем смотрите preview и готовый render целиком.

Публикация не автоматизирована: готовый MP4 сначала проверяется человеком и только потом
прикрепляется в Eclipse Chat или публикуется на landing/social channels.

## Supply-chain boundary

- HyperFrames runtime из CDN удалён: CLI сам инжектирует свой checksum-verified runtime при render.
- Preview использует vendored exact GSAP `3.14.2` с SHA-256 + SHA-384 SRI; байты взяты из
  официального GitHub tag и не требуют CDN во время preview.
- GSAP распространяется по отдельной GreenSock “no charge” license, а не по Apache-2.0 HyperFrames;
  copyright header сохраняется, условия redistribution проверяются перед отдельной продажей template/SDK.
- Query parameters не пересылаются в composition iframe.
- Runner принимает только локальный `hyperframes@0.7.88`, проверяет package name/version и
  не использует shell или network fallback.

## Форматы публикации

Один source template собирается в три deterministic composition:

```powershell
npm run render:landscape # 1920x1080
npm run render:vertical  # 1080x1920
npm run render:square    # 1080x1080
```

Перед render фиксированный скрипт создаёт host variant и пять согласованных sub-compositions в
ignored-папке `generated/`. Размеры и composition id читаются только из `package.json`;
пользовательский путь или shell-команда не принимаются. Результат всё равно нужно просмотреть и
подтвердить вручную перед публикацией.
