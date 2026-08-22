@echo off
setlocal
title Eclipse Media Launcher

where pwsh.exe >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Eclipse-Media.ps1"
) else (
  pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Eclipse-Media.ps1"
)
if errorlevel 1 (
  echo.
  echo Eclipse Media could not start. See the message above.
  pause
)

endlocal
