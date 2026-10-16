Add-Type -AssemblyName System.Drawing
$sizes = @(16, 32, 48, 128)
foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brushBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
    $g.FillEllipse($brushBg, 0, 0, $sz, $sz)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), [Math]::Max(1.5, $sz / 12))
    $g.DrawEllipse($pen, [Math]::Max(2, $sz/8), [Math]::Max(2, $sz/8), $sz - [Math]::Max(4, $sz/4), $sz - [Math]::Max(4, $sz/4))
    $font = New-Object System.Drawing.Font('Arial', [Math]::Max(8, $sz / 2.5), [System.Drawing.FontStyle]::Bold)
    $brushTxt = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 189, 248))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $sz, $sz)
    $g.DrawString('T', $font, $brushTxt, $rect, $sf)
    $bmp.Save("d:\GIT\Extension\Parse_Image_to_Text\icons\icon$sz.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}
Write-Output "Done generating icons"
