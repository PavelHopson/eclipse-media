[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Join-Path $repoRoot 'launcher\EclipseMedia.Launcher.csproj'
$publishDir = Join-Path $repoRoot '.runtime\launcher-publish'
$publishedExe = Join-Path $publishDir 'Eclipse Media.exe'
$targetExe = Join-Path $repoRoot 'Eclipse Media.exe'

$dotnet = Get-Command 'dotnet.exe' -ErrorAction SilentlyContinue
if (-not $dotnet) {
    throw '.NET 8 SDK or newer is required to build Eclipse Media.exe.'
}

New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

& $dotnet.Source publish $project `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    --output $publishDir `
    -p:PublishSingleFile=true `
    -p:RestoreIgnoreFailedSources=true `
    --nologo

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $publishedExe)) {
    throw 'Eclipse Media.exe build failed.'
}

Copy-Item -LiteralPath $publishedExe -Destination $targetExe -Force
$size = (Get-Item -LiteralPath $targetExe).Length
Write-Host "Built: $targetExe ($size bytes)" -ForegroundColor Green
