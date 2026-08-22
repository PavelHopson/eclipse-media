[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot 'frontend'

& (Join-Path $repoRoot 'Build-Eclipse-Media-Core.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Media Core build failed.' }

Push-Location $frontendDir
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    & npm.cmd run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'Tauri desktop build failed.' }
} finally {
    Pop-Location
}

$installer = Get-ChildItem -LiteralPath (Join-Path $frontendDir 'src-tauri\target\release\bundle\nsis') `
    -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw 'NSIS installer was not found after a successful build.' }

$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
Write-Host "Installer: $($installer.FullName)" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor DarkGray
