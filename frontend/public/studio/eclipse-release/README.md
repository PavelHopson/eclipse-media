# Eclipse Release Signal

15-секундная HyperFrames-ready композиция для release announcements, roadmap updates и
коротких product teasers Eclipse Forge. Browser preview и локальный contract check уже работают;
CLI render остаётся закрыт до exact dependency audit и lockfile.

## Быстрый старт

Для preview достаточно запущенного frontend Eclipse Media. Offline contract check требует Node.js 22+:

```powershell
cd frontend/public/studio/eclipse-release
npm run check
```

`check` проверяет пять scene windows, общую длительность, SHA-256 и SRI локальной exact-копии
GSAP, deterministic guards и отсутствие implicit `npx`.

Целевой CLI закреплён на официальном tag `@hyperframes/cli@0.7.88` и commit
`74fadf69c464c0e0658bd7a6b740986fc3aceba8`. Он намеренно не скачивается автоматически.
После восстановления npm registry нужно отдельно проверить package metadata/integrity, добавить exact
devDependency и commit `package-lock.json`. Только затем:

```powershell
npm run verify
npm run render
```

Результат: `renders/eclipse-release.mp4`. Если exact CLI не установлен, runner завершится fail closed.
Не запускайте template с production secrets или закрытыми клиентскими материалами.

## Как менять ролик

1. Обновите текст внутри нужной `.scene-content` в `index.html`.
2. Если меняете длительность сцены, пересчитайте `data-start` следующих сцен и общий
   `data-duration` у `#stage`.
3. Для новых анимаций используйте только paused GSAP timeline `window.__timelines`.
4. Не используйте `Date.now()`, `Math.random()`, `repeat: -1` или wall-clock logic.
5. После каждой правки выполняйте `npm run check`, затем смотрите preview целиком; после подключения
   exact CLI дополнительно выполняйте `npm run verify`.

Публикация не автоматизирована: готовый MP4 сначала проверяется человеком и только потом
прикрепляется в Eclipse Chat или публикуется на landing/social channels.

## Supply-chain boundary

- HyperFrames runtime из CDN удалён: CLI сам инжектирует свой checksum-verified runtime при render.
- Preview использует vendored exact GSAP `3.14.2` с SHA-256 + SHA-384 SRI; байты взяты из
  официального GitHub tag и не требуют CDN во время preview.
- GSAP распространяется по отдельной GreenSock “no charge” license, а не по Apache-2.0 HyperFrames;
  copyright header сохраняется, условия redistribution проверяются перед отдельной продажей template/SDK.
- Query parameters не пересылаются в composition iframe.
- Runner принимает только локальный `@hyperframes/cli@0.7.88`, проверяет package name/version и
  не использует shell или network fallback.
