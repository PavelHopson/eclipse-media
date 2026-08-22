[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetExe = Join-Path $repoRoot 'Eclipse Media.exe'
if (-not (Test-Path -LiteralPath $targetExe)) {
    throw 'Eclipse Media.exe is missing. Run Build-Eclipse-Media-Exe.ps1 first.'
}

$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
if (-not $desktop -or -not (Test-Path -LiteralPath $desktop)) {
    throw 'Windows Desktop directory was not found.'
}

$shortcutPath = Join-Path $desktop 'Eclipse Media.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $repoRoot
$shortcut.IconLocation = "$targetExe,0"
$shortcut.Description = 'Launch Eclipse Media local workspace'
$shortcut.Save()

if (-not (Test-Path -LiteralPath $shortcutPath)) {
    throw 'Desktop shortcut was not created.'
}

Write-Host "Shortcut created: $shortcutPath" -ForegroundColor Green
