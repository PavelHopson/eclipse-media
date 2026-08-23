[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot 'frontend'
$tauriDir = Join-Path $frontendDir 'src-tauri'

& (Join-Path $repoRoot 'Build-Eclipse-Media-Core.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Media Core build failed.' }

Push-Location $frontendDir
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }

    & (Join-Path $tauriDir 'installer\Generate-Branding.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Installer branding generation failed.' }

    $tauriCli = Join-Path $frontendDir 'node_modules\@tauri-apps\cli\tauri.js'
    if (-not (Test-Path -LiteralPath $tauriCli)) { throw 'Pinned local Tauri CLI was not found.' }
    & node $tauriCli icon (Join-Path $tauriDir 'icon-master.svg') --output (Join-Path $tauriDir 'icons')
    if ($LASTEXITCODE -ne 0) { throw 'Desktop icon generation failed.' }

    & npm.cmd run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'Tauri desktop build failed.' }
} finally {
    Pop-Location
}

$installer = Get-ChildItem -LiteralPath (Join-Path $frontendDir 'src-tauri\target\release\bundle\nsis') `
    -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw 'NSIS installer was not found after a successful build.' }

& (Join-Path $tauriDir 'installer\Validate-Installer.ps1') -InstallerPath $installer.FullName
if ($LASTEXITCODE -ne 0) { throw 'Installer validation failed.' }

$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
Write-Host "Installer: $($installer.FullName)" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor DarkGray
