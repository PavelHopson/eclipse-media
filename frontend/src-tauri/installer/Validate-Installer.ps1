[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$tauriDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Split-Path -Parent $tauriDir
$repoRoot = Split-Path -Parent $frontendDir
$resolvedInstaller = (Resolve-Path -LiteralPath $InstallerPath).Path

$package = Get-Content -Raw -LiteralPath (Join-Path $frontendDir 'package.json') | ConvertFrom-Json
$config = Get-Content -Raw -LiteralPath (Join-Path $tauriDir 'tauri.conf.json') | ConvertFrom-Json
$expectedVersion = [string]$config.version
if ($package.version -ne $expectedVersion) {
    throw "package.json version $($package.version) does not match Tauri $expectedVersion."
}

$cargo = Get-Content -Raw -LiteralPath (Join-Path $tauriDir 'Cargo.toml')
if ($cargo -notmatch "(?m)^version = `"$([regex]::Escape($expectedVersion))`"\s*$") {
    throw "Cargo.toml version does not match $expectedVersion."
}

$backend = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'backend\main.py')
if ($backend -notmatch "version=`"$([regex]::Escape($expectedVersion))`"") {
    throw "Backend API version does not match $expectedVersion."
}

$hooks = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'hooks.nsh')
foreach ($requiredHook in (
    'MUI_FORCECLASSICCONTROLS',
    'MUI_FINISHPAGE_LINK_COLOR "6BA3FF"',
    '!macro NSIS_HOOK_PREINSTALL',
    'CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"',
    'CheckIfAppIsRunning "eclipse-media-core.exe" "${PRODUCTNAME}"'
)) {
    if ($hooks -notmatch [regex]::Escape($requiredHook)) {
        throw "Installer UX contract is missing $requiredHook."
    }
}

$assets = @(
    @{ Name = 'sidebar.bmp'; Width = 164; Height = 314 },
    @{ Name = 'header.bmp'; Width = 150; Height = 57 },
    @{ Name = 'uninstaller-header.bmp'; Width = 150; Height = 57 }
)
foreach ($asset in $assets) {
    $path = Join-Path $PSScriptRoot $asset.Name
    $image = [System.Drawing.Image]::FromFile($path)
    try {
        if ($image.Width -ne $asset.Width -or $image.Height -ne $asset.Height) {
            throw "$($asset.Name) must be $($asset.Width)x$($asset.Height), found $($image.Width)x$($image.Height)."
        }
        if ($image.PixelFormat -ne [System.Drawing.Imaging.PixelFormat]::Format24bppRgb) {
            throw "$($asset.Name) must be a 24-bit RGB bitmap, found $($image.PixelFormat)."
        }
    } finally {
        $image.Dispose()
    }
}

$installer = Get-Item -LiteralPath $resolvedInstaller
if ($installer.VersionInfo.ProductVersion -ne $expectedVersion) {
    throw "Installer ProductVersion $($installer.VersionInfo.ProductVersion) does not match $expectedVersion."
}

$signature = Get-AuthenticodeSignature -LiteralPath $resolvedInstaller
$hash = Get-FileHash -LiteralPath $resolvedInstaller -Algorithm SHA256
Write-Host "Validated Eclipse Media installer $expectedVersion." -ForegroundColor Green
Write-Host "Signature: $($signature.Status)" -ForegroundColor $(if ($signature.Status -eq 'Valid') { 'Green' } else { 'Yellow' })
Write-Host "SHA-256: $($hash.Hash)" -ForegroundColor DarkGray
