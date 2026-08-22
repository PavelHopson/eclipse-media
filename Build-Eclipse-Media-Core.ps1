[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$python = Join-Path $backendDir '.venv\Scripts\python.exe'
$target = (& rustc --print host-tuple).Trim()
if ($target -ne 'x86_64-pc-windows-msvc') {
    throw "The current desktop spike supports Windows x64 only. Found: $target"
}
if (-not (Test-Path -LiteralPath $python)) {
    throw 'backend/.venv is missing. Run Start-Eclipse-Media.ps1 once first.'
}

$runtimeDir = Join-Path $repoRoot '.runtime\media-core'
$distDir = Join-Path $runtimeDir 'dist'
$workDir = Join-Path $runtimeDir 'work'
$specDir = Join-Path $runtimeDir 'spec'
$binaryDir = Join-Path $repoRoot 'frontend\src-tauri\binaries'
$targetBinary = Join-Path $binaryDir "eclipse-media-core-$target.exe"

New-Item -ItemType Directory -Force -Path $distDir, $workDir, $specDir, $binaryDir | Out-Null
& $python -m pip install --disable-pip-version-check --no-input -r (Join-Path $backendDir 'requirements-desktop.txt')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller dependency installation failed.' }

& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name 'eclipse-media-core' `
    --paths $backendDir `
    --collect-all yt_dlp `
    --collect-all certifi `
    --distpath $distDir `
    --workpath $workDir `
    --specpath $specDir `
    (Join-Path $backendDir 'desktop_sidecar.py')
if ($LASTEXITCODE -ne 0) { throw 'Eclipse Media Core build failed.' }

$published = Join-Path $distDir 'eclipse-media-core.exe'
if (-not (Test-Path -LiteralPath $published)) { throw 'Built Media Core binary was not found.' }
Copy-Item -LiteralPath $published -Destination $targetBinary -Force
$hash = (Get-FileHash -LiteralPath $targetBinary -Algorithm SHA256).Hash
Write-Host "Built: $targetBinary" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor DarkGray
