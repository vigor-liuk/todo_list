$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '..\build'
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#9380C8'))
$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(8,8,64,64,180,90)
$shape.AddArc(184,8,64,64,270,90)
$shape.AddArc(184,184,64,64,0,90)
$shape.AddArc(8,184,64,64,90,90)
$shape.CloseFigure()
$graphics.FillPath($brush,$shape)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White),20
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$points = [System.Drawing.Point[]]@((New-Object System.Drawing.Point 66,130),(New-Object System.Drawing.Point 107,171),(New-Object System.Drawing.Point 192,82))
$graphics.DrawLines($pen,$points)
$pngPath = Join-Path $iconDirectory 'icon.png'
$bitmap.Save($pngPath,[System.Drawing.Imaging.ImageFormat]::Png)
$png = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create((Join-Path $iconDirectory 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png)
$writer.Dispose(); $stream.Dispose(); $pen.Dispose(); $shape.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
