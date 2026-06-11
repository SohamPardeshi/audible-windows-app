# Generates the application icon (build/icon.png and build/icon.ico) using
# .NET System.Drawing — no external image tooling required.
#
# Design: a rounded-square tile filled with the app's accent gradient
# (orange #f8991d -> red-orange #ff6a3d) on a transparent background, with a
# white "play" triangle and three sound-wave arcs. Run with:
#   powershell -ExecutionPolicy Bypass -File scripts/gen-icon.ps1

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root 'build'
$resourcesDir = Join-Path $root 'resources'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

function New-RoundedRectPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = [single]$size
    $inset = $s * 0.055
    $tileW = $s - 2 * $inset
    $radius = $s * 0.225

    # Accent gradient tile.
    $tileRect = New-Object System.Drawing.RectangleF($inset, $inset, $tileW, $tileW)
    $c1 = [System.Drawing.Color]::FromArgb(255, 0xF8, 0x99, 0x1D)
    $c2 = [System.Drawing.Color]::FromArgb(255, 0xFF, 0x6A, 0x3D)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($tileRect, $c1, $c2, 55.0)
    $tilePath = New-RoundedRectPath $inset $inset $tileW $tileW $radius
    $g.FillPath($brush, $tilePath)

    # White play triangle (slightly left of centre to leave room for arcs).
    $cx = $s * 0.40
    $cy = $s * 0.50
    $tri = $s * 0.30
    $pts = @(
        (New-Object System.Drawing.PointF(($cx - $tri * 0.5), ($cy - $tri * 0.62))),
        (New-Object System.Drawing.PointF(($cx - $tri * 0.5), ($cy + $tri * 0.62))),
        (New-Object System.Drawing.PointF(($cx + $tri * 0.72), $cy))
    )
    $triPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $triPath.AddPolygon($pts)
    # Round the triangle corners a touch.
    $triPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, ($s * 0.055))
    $triPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($white, $triPath)
    $g.DrawPath($triPen, $triPath)

    # Three sound-wave arcs radiating from the triangle tip.
    $arcCx = $s * 0.46
    $arcCy = $cy
    $wavePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(235, 255, 255, 255), ($s * 0.045))
    $wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($i in 1..3) {
        $rr = $s * (0.10 + 0.075 * $i)
        $rect = New-Object System.Drawing.RectangleF(($arcCx - $rr), ($arcCy - $rr), ($rr * 2), ($rr * 2))
        $g.DrawArc($wavePen, $rect, -42, 84)
    }

    $g.Dispose()
    return $bmp
}

# --- icon.png (512x512) ---
$pngPath = Join-Path $buildDir 'icon.png'
$png = New-IconBitmap 512
$png.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()
# Copy for the BrowserWindow icon (dev + Linux).
Copy-Item $pngPath (Join-Path $resourcesDir 'icon.png') -Force
Write-Host "Wrote $pngPath"

# --- icon.ico (multi-resolution, PNG-compressed frames) ---
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($sz in $sizes) {
    $bmp = New-IconBitmap $sz
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $frames += , @{ size = $sz; bytes = $ms.ToArray() }
    $ms.Dispose()
}

$icoPath = Join-Path $buildDir 'icon.ico'
$fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
# ICONDIR
$bw.Write([uint16]0)          # reserved
$bw.Write([uint16]1)          # type = icon
$bw.Write([uint16]$frames.Count)
# Directory entries are followed by image data.
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
    $dim = if ($f.size -ge 256) { 0 } else { $f.size }
    $bw.Write([byte]$dim)      # width
    $bw.Write([byte]$dim)      # height
    $bw.Write([byte]0)         # color count
    $bw.Write([byte]0)         # reserved
    $bw.Write([uint16]1)       # color planes
    $bw.Write([uint16]32)      # bits per pixel
    $bw.Write([uint32]$f.bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $f.bytes.Length
}
foreach ($f in $frames) {
    $bw.Write($f.bytes)
}
$bw.Flush()
$bw.Close()
$fs.Close()
Write-Host "Wrote $icoPath"
