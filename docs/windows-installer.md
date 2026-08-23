# Eclipse Media Windows installer

## Product contract

Установщик должен выглядеть частью Eclipse Forge и при этом оставаться предсказуемым Windows
installer. Основной путь виден без инструкции:

1. выбрать русский или английский язык;
2. подтвердить установку Eclipse Media;
3. дождаться завершения;
4. отдельно выбрать ярлык на рабочем столе и запуск приложения.

Установка работает в `currentUser`-режиме. Installer не подключает аккаунты, OAuth, аналитику,
платежи или внешние сервисы. Для установки приложения не запрашивается автоматическое повышение
прав. Если WebView2 отсутствует, выбранный Tauri `downloadBootstrapper` может получить официальный
Microsoft bootstrapper; это единственная предусмотренная bootstrap network boundary.

## Visual system

| Surface | Contract |
|---|---|
| Background | `#05070A` |
| Raised surface | `#0C1117` |
| Border | `#263244` |
| Signal blue | `#6BA3FF` |
| Warm gold | `#D4AF37` |
| Primary text | `#F2F5F9` |
| Secondary text | `#94A3B8` |

`frontend/src-tauri/icon-master.svg` — единый источник app/installer/uninstaller icon. Новый знак
соединяет eclipse ring и media play state; gold dot остаётся небольшим системным сигналом, а не
декоративным gradient.

NSIS assets:

- `installer/sidebar.bmp` — `164x314`, dark welcome/finish identity;
- `installer/header.bmp` — `150x57`, install operations;
- `installer/uninstaller-header.bmp` — `150x57`, remove operations;
- `installer/hooks.nsh` — welcome/finish colors, abort warning, Eclipse Forge link и ранняя
  проверка desktop/Media Core процессов перед копированием файлов;
- `installer/Generate-Branding.ps1` — генератор 24-bit BMP без внешнего image runtime.

Операционные страницы NSIS остаются системно-светлыми. Это осознанная граница: native controls,
контраст, keyboard focus, масштабирование Windows и screen-reader behavior важнее полного dark-mode
skin, который потребовал бы хрупкого собственного installer template.

## Build

```powershell
.\Build-Eclipse-Media-Desktop.ps1
```

Root script выполняет следующие fail-closed шаги:

1. собирает локальный PyInstaller Media Core sidecar;
2. устанавливает frontend dependencies из lockfile;
3. регенерирует NSIS branding;
4. регенерирует desktop icons только pinned local Tauri CLI;
5. собирает release EXE и LZMA NSIS bundle.

Текущий artifact: `frontend/src-tauri/target/release/bundle/nsis/Eclipse Media_1.3.3_x64-setup.exe`.
Он является unsigned pilot и не должен публиковаться как trusted production installer до
code-signing gate.

## Visual and safety QA

Перед release проверить:

- language dialog показывает новый installer icon;
- welcome/finish имеют тёмный surface и читаемый русский/английский текст;
- sidebar и header не масштабируются и не обрезаются;
- `Далее`, `Отмена`, keyboard focus и abort confirmation работают нативно;
- desktop shortcut создаётся только после явного выбора;
- при запущенном desktop или оставшемся фоновом Media Core установка до копирования показывает
  локализованное подтверждение закрытия процесса; `Пропустить` для заблокированного EXE недоступен;
- installer version совпадает с app, API, Cargo и package version;
- `Get-AuthenticodeSignature` имеет ожидаемый статус;
- SHA-256 записан рядом с release artifact;
- uninstall не удаляет выбранные пользователем медиафайлы.

Для rollback удалить Eclipse Media через Windows Settings. Пользовательские медиа, сохранённые в
выбранные каталоги, не входят в application install boundary и не должны удаляться установщиком.
