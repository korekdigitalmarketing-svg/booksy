param(
  [string]$Source = "Images & Logo/Korek Booking.Logo.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$references = [AppDomain]::CurrentDomain.GetAssemblies() |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_.Location) } |
  Select-Object -ExpandProperty Location

Add-Type -ReferencedAssemblies $references -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class BrandBackgroundExtractor
{
    private static bool IsBackground(Color color)
    {
        int minimum = Math.Min(color.R, Math.Min(color.G, color.B));
        int maximum = Math.Max(color.R, Math.Max(color.G, color.B));
        return minimum >= 238 && maximum - minimum <= 14;
    }

    public static Bitmap Extract(Bitmap source)
    {
        var output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(output)) graphics.DrawImageUnscaled(source, 0, 0);

        var visited = new bool[output.Width * output.Height];
        var queue = new int[output.Width * output.Height];
        int head = 0;
        int tail = 0;
        Action<int, int> add = (x, y) => {
            if (x < 0 || y < 0 || x >= output.Width || y >= output.Height) return;
            int index = y * output.Width + x;
            if (visited[index]) return;
            visited[index] = true;
            if (IsBackground(output.GetPixel(x, y))) queue[tail++] = index;
        };

        for (int x = 0; x < output.Width; x++) { add(x, 0); add(x, output.Height - 1); }
        for (int y = 0; y < output.Height; y++) { add(0, y); add(output.Width - 1, y); }

        while (head < tail)
        {
            int index = queue[head++];
            int x = index % output.Width;
            int y = index / output.Width;
            output.SetPixel(x, y, Color.Transparent);
            add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
        }

        // The clock face inside the closed O cannot connect to an outer edge.
        // Clear only its neutral checker pixels and preserve the colored ticks.
        for (int y = 245; y <= 435; y++)
        {
            for (int x = 915; x <= 1180; x++)
            {
                if (IsBackground(output.GetPixel(x, y))) output.SetPixel(x, y, Color.Transparent);
            }
        }
        return output;
    }
}
"@

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$sourceImage = [System.Drawing.Bitmap]::FromFile($sourcePath)
$logo = [BrandBackgroundExtractor]::Extract($sourceImage)

$brandDir = Join-Path (Get-Location) "public/brand"
New-Item -ItemType Directory -Force -Path $brandDir | Out-Null
$logoPath = Join-Path $brandDir "korek-booking-logo.png"
$logo.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)

function Save-ResizedPng($source, [System.Drawing.Rectangle]$sourceRect, [int]$width, [int]$height, [string]$path, [System.Drawing.Color]$background) {
  $output = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.Clear($background)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, $width, $height), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()
  $output.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
}

$markCrop = New-Object System.Drawing.Rectangle 90, 62, 620, 620
Save-ResizedPng $logo $markCrop 512 512 (Join-Path $brandDir "korek-booking-mark.png") ([System.Drawing.Color]::Transparent)
Save-ResizedPng $logo $markCrop 512 512 (Join-Path (Get-Location) "app/icon.png") ([System.Drawing.Color]::Transparent)
Save-ResizedPng $logo $markCrop 180 180 (Join-Path (Get-Location) "app/apple-icon.png") ([System.Drawing.Color]::White)

$og = New-Object System.Drawing.Bitmap 1200, 630, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$ogGraphics = [System.Drawing.Graphics]::FromImage($og)
$ogGraphics.Clear([System.Drawing.Color]::White)
$ogGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$ogGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$ogGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$targetWidth = 1040
$targetHeight = [int]($targetWidth * $logo.Height / $logo.Width)
$ogGraphics.DrawImage($logo, (New-Object System.Drawing.Rectangle 80, ([int](315 - $targetHeight / 2)), $targetWidth, $targetHeight))
$ogGraphics.Dispose()
$og.Save((Join-Path $brandDir "korek-booking-og.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$og.Dispose()

$logo.Dispose()
$sourceImage.Dispose()

Write-Output "Built Korek Booking brand assets in public/brand and app/."
