Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # 1. Background dark rounded rectangle
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($sz, $sz)),
        [System.Drawing.Color]::FromArgb(15, 23, 42),
        [System.Drawing.Color]::FromArgb(30, 27, 75)
    )

    $rect = New-Object System.Drawing.RectangleF(0, 0, $sz, $sz)
    $radius = [Math]::Max(3, [int]($sz * 0.22))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2

    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($sz - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($sz - $diameter, $sz - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $sz - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    $g.FillPath($bgBrush, $path)

    # 2. Outer bracket corners (Google Lens brackets)
    $bracketPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), [Math]::Max(1.5, $sz / 14))
    $bracketPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $bracketPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $bracketPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $margin = [Math]::Max(2, $sz * 0.16)
    $len = [Math]::Max(3, $sz * 0.22)

    # Top-Left
    $g.DrawLine($bracketPen, $margin, $margin + $len, $margin, $margin)
    $g.DrawLine($bracketPen, $margin, $margin, $margin + $len, $margin)

    # Top-Right
    $g.DrawLine($bracketPen, $sz - $margin, $margin + $len, $sz - $margin, $margin)
    $g.DrawLine($bracketPen, $sz - $margin, $margin, $sz - $margin - $len, $margin)

    # Bottom-Left
    $g.DrawLine($bracketPen, $margin, $sz - $margin - $len, $margin, $sz - $margin)
    $g.DrawLine($bracketPen, $margin, $sz - $margin, $margin + $len, $sz - $margin)

    # Bottom-Right
    $g.DrawLine($bracketPen, $sz - $margin, $sz - $margin - $len, $sz - $margin, $sz - $margin)
    $g.DrawLine($bracketPen, $sz - $margin, $sz - $margin, $sz - $margin - $len, $sz - $margin)

    # 3. Center Glowing Scanner Circle
    $centerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(168, 85, 247), [Math]::Max(1.2, $sz / 18))
    $circleRadius = [Math]::Max(3, $sz * 0.26)
    $center = $sz / 2
    $g.DrawEllipse($centerPen, $center - $circleRadius, $center - $circleRadius, $circleRadius * 2, $circleRadius * 2)

    # 4. Central Scan Line
    $scanPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), [Math]::Max(1, $sz / 22))
    $g.DrawLine($scanPen, $center - $circleRadius + 1, $center, $center + $circleRadius - 1, $center)

    # 5. Core AI Dot
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 63, 94))
    $dotSize = [Math]::Max(2, $sz * 0.1)
    $g.FillEllipse($dotBrush, $center - ($dotSize / 2), $center - ($dotSize / 2), $dotSize, $dotSize)

    # Save PNG
    $dest = "d:\GIT\Extension\Parse_Image_to_Text\icons\icon$sz.png"
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $bgBrush.Dispose()
    $bracketPen.Dispose()
    $centerPen.Dispose()
    $scanPen.Dispose()
    $dotBrush.Dispose()
    $path.Dispose()
}

Write-Output "Successfully generated new sleek icons!"
