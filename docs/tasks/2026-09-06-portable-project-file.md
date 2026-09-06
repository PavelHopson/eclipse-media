# Переносимый файл проекта Media

Дата: 2026-09-06.
Статус: опубликовано в web-production и независимо проверено на HTTPS-сайте.
Checkout: E:/projects/eclipse-media, существующая ветка master.
База: 94ca980; исходно чистое дерево. Для релиза используется существующая master; новая ветка не создаётся.

## Объём и решения

Пользователь подтвердил следующий этап: скачать и открыть единый файл разбора, тезисов, бит-карты и режиссуры. Множественные проекты и связь тезисов со сценами остаются следующими этапами.

Контракт и границы: [project-file-format.md](../project-file-format.md).

- Кнопки доступны в «Плане» и «Бит-карте» и работают с обоими разделами, даже если один ещё не открывался.
- Импорт только через проверку файла и явное подтверждение замены обоих разделов.
- Один compare-and-swap batch внутри IndexedDB предотвращает частичную замену. Локальные версии защищают от устаревшего предпросмотра.
- Автосохранение остаётся настройкой устройства. Открытие не включает его принудительно.
- Асинхронная обработка прежнего файла не может заменить новый проект. Подписки на уведомления других вкладок разделяются по счётчику пользователей.
- The Taste применён к компактной рабочей форме, не к маркетинговому редизайну: текущие tokens, шрифты, навигация и радиусы сохранены. Design read: локальный рабочий инструмент; variance 3, motion 1, density 7. Новых библиотек, иллюстраций и анимаций нет.

## Доказательства

- Frontend: **71/71 тест**, lint, typecheck и build PASS.
- Backend: **70/70 unittest**, без изменений сервера.
- Новый scripts/qa-project-files.cjs: **8 групп PASS**. Перенос в свежий профиль, размеры 1440/390/320, отмена, keyboard focus trap, reload, сохранение неоткрытого раздела, повреждения/oversize/UTF-8, предварительная копия, откат при ошибке второго put, retry, другая вкладка, выключенное autosave, инертный HTML, memory-only import/export.
- scripts/qa-local-drafts.cjs: **7 групп PASS**, включая 2000 фрагментов, одну запись при наборе и отсутствие long tasks в этом сценарии.
- .runtime/news-pilot-20260906/browser-qa.cjs: **7 групп PASS**, прежние сценарии исследования и режиссуры.
- Во всех браузерных прогонах: 0 JS/HTTP ошибок, 0 внешних запросов, 0 серверных мутаций.
- Снимки desktop/mobile просмотрены: .runtime/project-files-20260906/preview-1440.png, preview-320.png. Отчёт: .runtime/project-files-20260906/results.json.
- npm audit --json: 0 info/low/moderate/high/critical.
- Штатный git diff --check: PASS. Пробный запуск с отключением CRLF-нормализации давал ложные предупреждения на существующих CRLF-строках; настройки Git не менялись.
- Build: index-C2Ve6_el.js (427.41 kB), index-BkbNA0df.css (126.82 kB). Обычные build-time предупреждения по шрифтам: файлы копируются последним шагом; HTTP ошибок по ним в браузерном QA нет.

## Security pass

Применён conducting-api-security-testing пропорционально локальному импорту и хранению. Серверные API, auth, permissions и инфраструктура не менялись. Проверены строгая валидация, отсутствие выполнения импортированного текста, сетевых загрузок, секретов и небезопасного логирования, сохранность данных при конфликте и отказе второй записи.

Новых находок Critical/High/Medium не выявлено в изменённой поверхности. Остаточный Low-риск: переносимый JSON не зашифрован и включает субтитры и заметки; это явно показано в UI. Не считать файл подтверждением лицензии или согласия.

Lighthouse не запускался: CLI и пакет отсутствуют в доступном runtime. Safari/Firefox и нативная Windows desktop-сборка не проверялись. Полный security-аудит продукта не выполнялся.

## Разрешение и preflight релиза

Пользователь явно разрешил публикацию 2026-09-06. Проверены origin и master: после fetch HEAD и origin/master совпадают (94ca980), чужих входящих изменений нет. Предыдущий production workflow 34025696485 завершён успешно; активного production deploy нет.
Предрелизно повторены 71 frontend и 70 backend тестов, lint/typecheck/build, полный npm audit (0 находок), штатный diff check и проверка известных сигнатур credentials в релизных файлах. Публичный /api/health отвечает через штатный DNS и проверенный TLS: ok=true, local_edit/render_queue=preview-only, desktop_session=false.

Дополнительно применён analyzing-sbom-for-supply-chain-vulnerabilities: CycloneDX inventory содержит 166 компонентов и 167 dependency nodes без optional-пакетов. Полная генерация npm SBOM упёрлась в отсутствующие WASI optional-зависимости; они не устанавливались и lockfile не менялся. Отдельный npm audit выполнен по полному lockfile, без исключения optional. Артефакты в .runtime/project-files-20260906/release/. Независимая NVD/Grype-корреляция и аудит container base images не выполнялись; это не полный supply-chain certification.

## Подтверждённый production-релиз

- Приложение: commit **5550f280d1117cbd92b9ce9ea70416a5861921a8**, отправлен в существующую master. Новых веток нет.
- [CI 34030131804](https://github.com/PavelHopson/eclipse-media/actions/runs/34030131804): success для этого SHA.
- [Deploy production 34030208469](https://github.com/PavelHopson/eclipse-media/actions/runs/34030208469): success, завершён 2026-09-06T11:28:03Z. Frontend/backend checks, compose validation, image build, runtime smoke, upload и activation/healthcheck прошли. Откат не потребовался.
- Рабочий адрес: https://media.eclipse-forge.ru/?workspace=intake&intakeMode=research.
- Внешняя проверка 2026-09-06T11:30:34Z: HTML ссылается на нужные файлы, SHA-256 JS/CSS/icon совпадает с проверенной локальной сборкой; /api/health: ok=true, version=1.6.0, desktop_session=false, local_edit/render_queue=preview-only.
- JS /assets/index-C2Ve6_el.js: 427412 байт, SHA-256 d637a4ed457376288ad54439aae02e6e2f0358bfbca3f220db239ee2398cca7b.
- CSS /assets/index-BkbNA0df.css: 126822 байт, SHA-256 ffccecf364d20d190726bc9a880bf7d3379ec08e9b15511b01c66d564d8acb4a.
- Первоначальный Node HTTPS probe получил таймаут. Независимый PowerShell HTTPS probe вернул 200 и нужные asset names; DNS системы и публичный resolver согласованы на 111.88.125.84. Повтор Node probe с --dns-result-order=ipv4first прошёл. Системный DNS/hosts и TLS-проверки не менялись; browser QA выполнен без DNS override.
- На production прошли **22 группы Edge QA**: 8 project-file + 7 autosave + 7 research/direction. Включены desktop 1440, mobile 390/320, новый профиль, полный перенос, отмена, повреждённые/бинарные/oversize файлы, откат второй записи, retry, конфликт вкладок, отсутствие хранилища, прежние строгие экспорты и обработка тестового аудио.
- Во всех production-прогонах: **0 JS/HTTP ошибок, 0 внешних запросов, 0 серверных мутаций**. Использовались только синтетические fixtures и отдельные профили Edge. Desktop/mobile снимки опубликованного UI просмотрены.
- Артефакты: .runtime/project-files-20260906/production-release.json; .runtime/project-files-20260906/production/results.json; .runtime/draft-autosave-20260906/production/results.json; .runtime/news-pilot-20260906/production-browser-results.json.
- Новых Critical/High/Medium находок по проверенной поверхности нет. Описанный Low-риск незашифрованного JSON остаётся; полное сканирование контейнеров/NVD не заявляется. Desktop-установщик не выпускался, версия приложения остаётся 1.6.0; этот web-релиз идентифицируется SHA и asset hashes.

## Следующий безопасный шаг

Пользователь может открыть «План» или «Бит-карта» на production и использовать «Скачать проект» / «Открыть проект». Множественные проекты и связь тезисов со сценами остаются отдельными будущими этапами, без автоматического запуска.
