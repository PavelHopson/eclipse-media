[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$surface = [System.Drawing.Color]::FromArgb(5, 7, 10)
$surfaceRaised = [System.Drawing.Color]::FromArgb(12, 17, 23)
$border = [System.Drawing.Color]::FromArgb(38, 50, 68)
$blue = [System.Drawing.Color]::FromArgb(107, 163, 255)
$gold = [System.Drawing.Color]::FromArgb(212, 175, 55)
$text = [System.Drawing.Color]::FromArgb(242, 245, 249)
$muted = [System.Drawing.Color]::FromArgb(148, 163, 184)

function New-Canvas([int]$Width, [int]$Height, [System.Drawing.Color]$Background) {
    $bitmap = [System.Drawing.Bitmap]::new(
        $Width,
        $Height,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($Background)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    return @($bitmap, $graphics)
}

function Draw-EclipseMark(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Size,
    [bool]$LightBackground = $false
) {
    $inner = if ($LightBackground) { [System.Drawing.Color]::FromArgb(226, 232, 240) } else { $surfaceRaised }
    $innerBrush = [System.Drawing.SolidBrush]::new($inner)
    $ringPen = [System.Drawing.Pen]::new($border, [Math]::Max(2, $Size * 0.07))
    $ringPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    $bluePen = [System.Drawing.Pen]::new($blue, [Math]::Max(3, $Size * 0.12))
    $goldPen = [System.Drawing.Pen]::new($gold, [Math]::Max(2, $Size * 0.075))
    $bluePen.StartCap = $bluePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $goldPen.StartCap = $goldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $playBrush = [System.Drawing.SolidBrush]::new($(if ($LightBackground) { $surface } else { $text }))
    $dotBrush = [System.Drawing.SolidBrush]::new($gold)
    try {
        $Graphics.FillEllipse($innerBrush, $X, $Y, $Size, $Size)
        $Graphics.DrawEllipse($ringPen, $X, $Y, $Size, $Size)
        $inset = $Size * 0.12
        $arcSize = $Size - ($inset * 2)
        $Graphics.DrawArc($bluePen, $X + $inset, $Y + $inset, $arcSize, $arcSize, 135, 205)
        $Graphics.DrawArc($goldPen, $X + $inset, $Y + $inset, $arcSize, $arcSize, 330, 90)
        $points = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new($X + ($Size * 0.43), $Y + ($Size * 0.33)),
            [System.Drawing.PointF]::new($X + ($Size * 0.70), $Y + ($Size * 0.50)),
            [System.Drawing.PointF]::new($X + ($Size * 0.43), $Y + ($Size * 0.67))
        )
        $Graphics.FillPolygon($playBrush, $points)
        $dot = [Math]::Max(3, $Size * 0.09)
        $Graphics.FillEllipse($dotBrush, $X + ($Size * 0.76), $Y + ($Size * 0.08), $dot, $dot)
    } finally {
        $innerBrush.Dispose()
        $ringPen.Dispose()
        $bluePen.Dispose()
        $goldPen.Dispose()
        $playBrush.Dispose()
        $dotBrush.Dispose()
    }
}

$sidebar = New-Canvas 164 314 $surface
$sidebarBitmap = $sidebar[0]
$sidebarGraphics = $sidebar[1]
$blueBrush = [System.Drawing.SolidBrush]::new($blue)
$goldBrush = [System.Drawing.SolidBrush]::new($gold)
$textBrush = [System.Drawing.SolidBrush]::new($text)
$mutedBrush = [System.Drawing.SolidBrush]::new($muted)
$borderPen = [System.Drawing.Pen]::new($border, 1)
$brandFont = [System.Drawing.Font]::new('Segoe UI Semibold', 8, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$titleFont = [System.Drawing.Font]::new('Segoe UI Semibold', 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$metaFont = [System.Drawing.Font]::new('Segoe UI', 8, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
try {
    $sidebarGraphics.FillRectangle($blueBrush, 0, 0, 118, 4)
    $sidebarGraphics.FillRectangle($goldBrush, 118, 0, 46, 4)
    $sidebarGraphics.DrawString('ECLIPSE FORGE', $brandFont, $blueBrush, 18, 20)
    Draw-EclipseMark $sidebarGraphics 38 53 88
    $sidebarGraphics.DrawString('ECLIPSE', $titleFont, $textBrush, 18, 163)
    $sidebarGraphics.DrawString('MEDIA', $titleFont, $textBrush, 18, 188)
    $sidebarGraphics.DrawLine($borderPen, 18, 232, 146, 232)
    $sidebarGraphics.DrawString('LOCAL-FIRST', $brandFont, $blueBrush, 18, 247)
    $sidebarGraphics.DrawString('MEDIA WORKSPACE', $metaFont, $mutedBrush, 18, 262)
    $sidebarGraphics.FillEllipse($goldBrush, 18, 288, 5, 5)
    $sidebarGraphics.DrawString('PRIVATE BY DEFAULT', $metaFont, $mutedBrush, 29, 285)
    $sidebarBitmap.Save((Join-Path $PSScriptRoot 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
} finally {
    $sidebarGraphics.Dispose()
    $sidebarBitmap.Dispose()
    $blueBrush.Dispose()
    $goldBrush.Dispose()
    $textBrush.Dispose()
    $mutedBrush.Dispose()
    $borderPen.Dispose()
    $brandFont.Dispose()
    $titleFont.Dispose()
    $metaFont.Dispose()
}

function Write-Header([string]$Path, [bool]$Uninstall) {
    $paper = [System.Drawing.Color]::FromArgb(242, 245, 249)
    $canvas = New-Canvas 150 57 $paper
    $bitmap = $canvas[0]
    $graphics = $canvas[1]
    $bluePen = [System.Drawing.Pen]::new($blue, 3)
    $goldPen = [System.Drawing.Pen]::new($gold, 2)
    $labelBrush = [System.Drawing.SolidBrush]::new($(if ($Uninstall) { $gold } else { $blue }))
    $labelFont = [System.Drawing.Font]::new('Segoe UI Semibold', 8, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    try {
        $graphics.DrawLine($bluePen, 10, 20, 69, 20)
        $graphics.DrawLine($goldPen, 10, 28, 52, 28)
        $graphics.DrawString($(if ($Uninstall) { 'REMOVE' } else { 'INSTALL' }), $labelFont, $labelBrush, 10, 35)
        Draw-EclipseMark $graphics 98 7 43 $true
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
        $bluePen.Dispose()
        $goldPen.Dispose()
        $labelBrush.Dispose()
        $labelFont.Dispose()
    }
}

Write-Header (Join-Path $PSScriptRoot 'header.bmp') $false
Write-Header (Join-Path $PSScriptRoot 'uninstaller-header.bmp') $true

Write-Host 'Generated Eclipse Media NSIS branding assets.' -ForegroundColor Green
