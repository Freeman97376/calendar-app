$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriRoot = Join-Path $root "src-tauri"
$outputDir = Join-Path $root "dist-desktop"
$portableDir = Join-Path $outputDir "portable"
$binaryDir = Join-Path $tauriRoot "binaries"
$resourceDir = Join-Path $tauriRoot "resources\tesseract"
$licenseResourceDir = Join-Path $tauriRoot "resources\licenses"
$targetTriple = (& rustc --print host-tuple).Trim()
if ($LASTEXITCODE -ne 0) { throw "rustc target detection failed with exit code $LASTEXITCODE." }
$sidecarTarget = Join-Path $binaryDir "calendar-backend-$targetTriple.exe"

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$setup = Get-ChildItem -Path (Join-Path $tauriRoot "target\release\bundle\nsis") -Filter "*.exe" | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $setup) { throw "Tauri did not produce an NSIS installer." }
$setupOutput = Join-Path $outputDir "Calendar App Setup.exe"
Copy-Item -LiteralPath $setup.FullName -Destination $setupOutput -Force

$signature = "$($setup.FullName).sig"
if (-not (Test-Path -LiteralPath $signature)) {
  throw "Tauri did not produce the required updater signature for $($setup.Name)."
}
$signatureOutput = "$setupOutput.sig"
Copy-Item -LiteralPath $signature -Destination $signatureOutput -Force

if (Test-Path -LiteralPath $portableDir) {
  $resolvedPortable = (Resolve-Path -LiteralPath $portableDir).Path
  $resolvedOutput = (Resolve-Path -LiteralPath $outputDir).Path
  if (-not $resolvedPortable.StartsWith($resolvedOutput, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace portable directory outside dist-desktop: $resolvedPortable"
  }
  Remove-Item -LiteralPath $portableDir -Recurse -Force
}
New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $tauriRoot "target\release\calendar-app.exe") -Destination (Join-Path $portableDir "Calendar App.exe")
Copy-Item -LiteralPath $sidecarTarget -Destination (Join-Path $portableDir "calendar-backend.exe")
Copy-Item -LiteralPath $resourceDir -Destination (Join-Path $portableDir "tesseract") -Recurse
Copy-Item -LiteralPath $licenseResourceDir -Destination (Join-Path $portableDir "licenses") -Recurse
New-Item -ItemType File -Path (Join-Path $portableDir "portable.mode") -Force | Out-Null

$portableZip = Join-Path $outputDir "Calendar App Portable.zip"
Compress-Archive -Path (Join-Path $portableDir "*") -DestinationPath $portableZip -Force

$checksumPath = Join-Path $outputDir "SHA256SUMS.txt"
$artifacts = @($setupOutput, $signatureOutput, $portableZip)
$checksumLines = foreach ($artifact in $artifacts) {
  $hash = Get-FileHash -LiteralPath $artifact -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($artifact))"
}
[System.IO.File]::WriteAllLines($checksumPath, $checksumLines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Built: $setupOutput"
Write-Host "Built: $portableZip"
Write-Host "Checksums: $checksumPath"
