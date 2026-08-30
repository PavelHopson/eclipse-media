[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$ExitAfterReady
)

if ($env:ECLIPSE_MEDIA_SMOKE -eq '1') {
    $NoBrowser = $true
    $ExitAfterReady = $true
}

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$renderWorkspace = Join-Path $frontendDir 'public\studio\eclipse-release'
$runtimeDir = Join-Path $repoRoot '.runtime'
$venvDir = Join-Path $backendDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$packageJsonPath = Join-Path $frontendDir 'package.json'
$expectedVersion = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
if ($expectedVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw 'Could not determine the expected Eclipse Media version.'
}
$ownedProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Write-Step([string]$Message) {
    Write-Host "`n  $Message" -ForegroundColor Cyan
}

function Get-Sha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '')
        }
        finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
}

function Test-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Test-EclipseBackend {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        return $health.ok -eq $true -and $health.version -eq $expectedVersion
    }
    catch { return $false }
}

function Get-EclipseBackendVersion {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        if ($health.ok -eq $true -and $health.version -match '^\d+\.\d+\.\d+$') {
            return [string]$health.version
        }
    }
    catch { return $null }
    return $null
}

function Test-EclipseFrontend {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>Eclipse Media</title>'
    }
    catch { return $false }
}

function Resolve-Python {
    $candidates = [System.Collections.Generic.List[object]]::new()
    $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($pyLauncher) { $candidates.Add(@{ Path = $pyLauncher.Source; Prefix = @('-3') }) }

    $python = Get-Command 'python.exe' -ErrorAction SilentlyContinue
    if ($python) { $candidates.Add(@{ Path = $python.Source; Prefix = @() }) }

    $codexPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $codexPython) { $candidates.Add(@{ Path = $codexPython; Prefix = @() }) }

    foreach ($candidate in $candidates) {
        try {
            & $candidate.Path @($candidate.Prefix) -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>$null
            if ($LASTEXITCODE -eq 0) { return $candidate }
        }
        catch { continue }
    }

    throw 'Python 3.11+ not found. Install Python from python.org and run this file again.'
}

function Stop-OwnedProcesses {
    foreach ($process in $ownedProcesses) {
        if ($process -and -not $process.HasExited) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F 2>$null | Out-Null
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    Write-Host ''
    Write-Host '  ECLIPSE MEDIA' -ForegroundColor White
    Write-Host '  Local workspace launcher' -ForegroundColor DarkGray

    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Node.js 22+ not found. Install it from nodejs.org and run this file again.' }
    if (-not $npm) { throw 'Node.js 22+ not found. Install it from nodejs.org and run this file again.' }
    $nodeMajor = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) { throw "Node.js 22+ is required. Found version $nodeMajor." }

    if (-not (Get-Command 'ffmpeg.exe' -ErrorAction SilentlyContinue)) {
        Write-Warning 'FFmpeg is not available. Some video/audio conversions may fail.'
    }

    if ((Test-Url 'http://127.0.0.1:8000/api/health') -and -not (Test-EclipseBackend)) {
        $runningVersion = Get-EclipseBackendVersion
        if ($runningVersion) {
            throw "Eclipse Media v$runningVersion is still running. Close its launcher window, then start v$expectedVersion again."
        }
        throw 'Port 8000 is already used by another application.'
    }
    if ((Test-Url 'http://127.0.0.1:5173') -and -not (Test-EclipseFrontend)) {
        throw 'Port 5173 is already used by another application.'
    }

    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

    $python = Resolve-Python
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Write-Step 'Preparing isolated Python environment (first launch only)...'
        & $python.Path @($python.Prefix) -m venv $venvDir
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
    }

    $requirements = Join-Path $backendDir 'requirements.txt'
    $requirementsMarker = Join-Path $venvDir '.requirements-sha256'
    $requirementsHash = Get-Sha256 $requirements
    $installedHash = if (Test-Path -LiteralPath $requirementsMarker) { (Get-Content -LiteralPath $requirementsMarker -Raw).Trim() } else { '' }
    if ($requirementsHash -ne $installedHash) {
        Write-Step 'Installing pinned backend dependencies...'
        & $venvPython -m pip install --disable-pip-version-check --no-input -r $requirements
        if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
        Set-Content -LiteralPath $requirementsMarker -Value $requirementsHash -Encoding ascii
    }

    $lockfile = Join-Path $frontendDir 'package-lock.json'
    $frontendMarker = Join-Path $frontendDir 'node_modules\.eclipse-lock-sha256'
    $lockHash = Get-Sha256 $lockfile
    $installedLockHash = if (Test-Path -LiteralPath $frontendMarker) { (Get-Content -LiteralPath $frontendMarker -Raw).Trim() } else { '' }
    if ((Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules')) -and -not $installedLockHash) {
        & $npm.Source ls --prefix $frontendDir --depth=0 --silent 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Set-Content -LiteralPath $frontendMarker -Value $lockHash -Encoding ascii
            $installedLockHash = $lockHash
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules')) -or $lockHash -ne $installedLockHash) {
        Write-Step 'Installing frontend dependencies from package-lock.json...'
        & $npm.Source ci --prefix $frontendDir --ignore-scripts --no-audit
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        Set-Content -LiteralPath $frontendMarker -Value $lockHash -Encoding ascii
    }

    $renderLockfile = Join-Path $renderWorkspace 'package-lock.json'
    $renderMarker = Join-Path $renderWorkspace 'node_modules\.eclipse-lock-sha256'
    $renderLockHash = Get-Sha256 $renderLockfile
    $installedRenderHash = if (Test-Path -LiteralPath $renderMarker) { (Get-Content -LiteralPath $renderMarker -Raw).Trim() } else { '' }
    if (-not (Test-Path -LiteralPath (Join-Path $renderWorkspace 'node_modules')) -or $renderLockHash -ne $installedRenderHash) {
        Write-Step 'Installing exact local render dependencies...'
        & $npm.Source ci --prefix $renderWorkspace --ignore-scripts --no-audit
        if ($LASTEXITCODE -ne 0) { throw 'Render dependency installation failed.' }
        Set-Content -LiteralPath $renderMarker -Value $renderLockHash -Encoding ascii
    }

    $env:ECLIPSE_MEDIA_RENDER_QUEUE_ENABLED = 'true'
    $env:ECLIPSE_MEDIA_RENDER_WORKSPACE = $renderWorkspace
    $env:ECLIPSE_MEDIA_RENDER_NODE = $node.Source

    if (-not (Test-EclipseBackend)) {
        Write-Step 'Starting local API...'
        $backendProcess = Start-Process -FilePath $venvPython `
            -ArgumentList @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000') `
            -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeDir 'backend.log') `
            -RedirectStandardError (Join-Path $runtimeDir 'backend-error.log')
        $ownedProcesses.Add($backendProcess)
    }

    if (-not (Test-EclipseFrontend)) {
        Write-Step 'Starting the interface...'
        $viteCli = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $viteCli)) { throw 'Local Vite CLI is missing after dependency validation.' }
        $frontendProcess = Start-Process -FilePath $node.Source `
            -ArgumentList @($viteCli, '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
            -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.log') `
            -RedirectStandardError (Join-Path $runtimeDir 'frontend-error.log')
        $ownedProcesses.Add($frontendProcess)
    }

    Write-Step 'Waiting for Eclipse Media...'
    $ready = $false
    foreach ($attempt in 1..40) {
        if ((Test-EclipseBackend) -and (Test-EclipseFrontend)) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        throw "The application did not become ready. Logs: $runtimeDir"
    }

    Write-Host "`n  Ready: http://127.0.0.1:5173" -ForegroundColor Green
    Write-Host '  Local render queue: 1 active + 2 waiting, cancel available.' -ForegroundColor DarkGray
    Write-Host '  Keep this window open. Press Enter to stop services.' -ForegroundColor DarkGray
    if (-not $NoBrowser) {
        Start-Process 'http://127.0.0.1:5173'
    }
    if ($ExitAfterReady) { return }
    [void](Read-Host)
}
catch {
    Write-Host "`n  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Stop-OwnedProcesses
}
