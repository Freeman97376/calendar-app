$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriRoot = Join-Path $root "src-tauri"
$binaryDir = Join-Path $tauriRoot "binaries"
$resourceDir = Join-Path $tauriRoot "resources\tesseract"
$buildDir = Join-Path $root "build"
$venvDir = Join-Path $buildDir "desktop-venv"
$sidecarSource = Join-Path $root "build\pyinstaller-dist\calendar-backend.exe"
$targetTriple = (& rustc --print host-tuple).Trim()
if ($LASTEXITCODE -ne 0) { throw "rustc target detection failed with exit code $LASTEXITCODE." }

New-Item -ItemType Directory -Path $binaryDir -Force | Out-Null

function Stop-BuildSidecarProcesses {
  if (-not (Test-Path -LiteralPath $sidecarSource)) { return }
  $expectedPath = [System.IO.Path]::GetFullPath($sidecarSource)
  foreach ($process in Get-Process -Name "calendar-backend" -ErrorAction SilentlyContinue) {
    try {
      if (-not [string]::Equals($process.Path, $expectedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }
      & taskkill.exe /PID $process.Id /T /F *> $null
      if ($LASTEXITCODE -ne 0 -and -not $process.HasExited) {
        throw "taskkill exited with code $LASTEXITCODE"
      }
    } catch {
      throw "Unable to terminate stale build sidecar PID $($process.Id): $($_.Exception.Message)"
    }
  }
}

Stop-BuildSidecarProcesses

if (Test-Path -LiteralPath $venvDir) {
  $resolvedVenv = (Resolve-Path -LiteralPath $venvDir).Path
  $resolvedBuildDir = (Resolve-Path -LiteralPath $buildDir).Path
  if (-not $resolvedVenv.StartsWith($resolvedBuildDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace desktop venv outside build: $resolvedVenv"
  }
  Remove-Item -LiteralPath $venvDir -Recurse -Force
}
python -m venv $venvDir
if ($LASTEXITCODE -ne 0) { throw "Desktop venv creation failed with exit code $LASTEXITCODE." }
$venvPython = Join-Path $venvDir "Scripts\python.exe"
& $venvPython -m pip install --require-hashes -r (Join-Path $root "requirements-desktop.lock")
if ($LASTEXITCODE -ne 0) { throw "Desktop dependency installation failed with exit code $LASTEXITCODE." }
& $venvPython -m PyInstaller --noconfirm --clean --distpath (Join-Path $root "build\pyinstaller-dist") --workpath (Join-Path $root "build\pyinstaller-work") (Join-Path $root "calendar_backend.spec")
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE." }

$smokeDataDir = Join-Path $root "build\desktop-sidecar-smoke"
if (Test-Path -LiteralPath $smokeDataDir) {
  $resolvedSmokeDataDir = (Resolve-Path -LiteralPath $smokeDataDir).Path
  $resolvedBuildDir = (Resolve-Path -LiteralPath (Join-Path $root "build")).Path
  if (-not $resolvedSmokeDataDir.StartsWith($resolvedBuildDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace sidecar smoke data outside build: $resolvedSmokeDataDir"
  }
  Remove-Item -LiteralPath $smokeDataDir -Recurse -Force
}
New-Item -ItemType Directory -Path $smokeDataDir -Force | Out-Null

$smokeStdout = Join-Path $smokeDataDir "stdout.log"
$smokeStderr = Join-Path $smokeDataDir "stderr.log"
$sidecarArguments = @(
  "--mode", "desktop",
  "--host", "127.0.0.1",
  "--port", "0",
  "--sidecar",
  "--data-dir", "`"$smokeDataDir`"",
  "--tesseract-dir", "`"$resourceDir`""
)
$sidecarProcess = Start-Process -FilePath $sidecarSource -ArgumentList $sidecarArguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $smokeStdout -RedirectStandardError $smokeStderr
$sidecarHealthy = $false
$handshake = $null
try {
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    if ($sidecarProcess.HasExited) { break }
    if (-not $handshake -and (Test-Path -LiteralPath $smokeStdout)) {
      foreach ($line in Get-Content -LiteralPath $smokeStdout -ErrorAction SilentlyContinue) {
        if ($line.StartsWith("CALENDAR_BACKEND_READY={")) {
          try {
            $handshake = $line.Substring("CALENDAR_BACKEND_READY=".Length) | ConvertFrom-Json
          } catch {
            $handshake = $null
          }
        }
      }
    }
    if (-not $handshake) {
      Start-Sleep -Milliseconds 100
      continue
    }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($handshake.port)/api/health" -Headers @{ "X-Desktop-Token" = $handshake.launchToken } -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $sidecarHealthy = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 100
    }
  }
  if (-not $sidecarHealthy) {
    $backendLog = Join-Path $smokeDataDir "calendar-backend.log"
    $diagnostic = if (Test-Path -LiteralPath $backendLog) { Get-Content -LiteralPath $backendLog -Raw } else { "No backend diagnostic log." }
    throw "Packaged desktop sidecar failed its health check. handshakeReceived=$([bool]$handshake) diagnostic=$diagnostic"
  }
} finally {
  if (-not $sidecarProcess.HasExited) {
    & taskkill.exe /PID $sidecarProcess.Id /T /F *> $null
    if ($LASTEXITCODE -ne 0 -and -not $sidecarProcess.HasExited) {
      throw "Unable to terminate smoke sidecar tree PID $($sidecarProcess.Id)."
    }
  }
  $sidecarProcess.WaitForExit()
  Stop-BuildSidecarProcesses
  Remove-Item -LiteralPath $smokeStdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $smokeStderr -Force -ErrorAction SilentlyContinue
}

$sidecarTarget = Join-Path $binaryDir "calendar-backend-$targetTriple.exe"
Copy-Item -LiteralPath $sidecarSource -Destination $sidecarTarget -Force

$installedTesseract = "C:\Program Files\Tesseract-OCR"
if (-not (Test-Path -LiteralPath (Join-Path $installedTesseract "tesseract.exe"))) {
  throw "Tesseract was not found at $installedTesseract. Install it before building the desktop package."
}
if (Test-Path -LiteralPath $resourceDir) {
  $resolvedResource = (Resolve-Path -LiteralPath $resourceDir).Path
  if (-not $resolvedResource.StartsWith($tauriRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace Tesseract resources outside src-tauri: $resolvedResource"
  }
  Remove-Item -LiteralPath $resourceDir -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $resourceDir "tessdata") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $installedTesseract "tesseract.exe") -Destination $resourceDir
Copy-Item -Path (Join-Path $installedTesseract "*.dll") -Destination $resourceDir
Copy-Item -LiteralPath (Join-Path $installedTesseract "tessdata\eng.traineddata") -Destination (Join-Path $resourceDir "tessdata")
Copy-Item -LiteralPath (Join-Path $installedTesseract "tessdata\osd.traineddata") -Destination (Join-Path $resourceDir "tessdata")

$licenseResourceDir = Join-Path $tauriRoot "resources\licenses"
if (Test-Path -LiteralPath $licenseResourceDir) {
  $resolvedLicenseResource = (Resolve-Path -LiteralPath $licenseResourceDir).Path
  if (-not $resolvedLicenseResource.StartsWith($tauriRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace license resources outside src-tauri: $resolvedLicenseResource"
  }
  Remove-Item -LiteralPath $licenseResourceDir -Recurse -Force
}
New-Item -ItemType Directory -Path $licenseResourceDir -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $licenseResourceDir ".gitkeep") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root "THIRD_PARTY_NOTICES.md") -Destination $licenseResourceDir
Copy-Item -Path (Join-Path $root "licenses\*") -Destination $licenseResourceDir -Recurse
Copy-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "Programs\Python\Python314\LICENSE.txt") -Destination (Join-Path $licenseResourceDir "Python-PSF-LICENSE.txt") -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath (Join-Path $licenseResourceDir "Python-PSF-LICENSE.txt"))) {
  Copy-Item -LiteralPath (Join-Path ([System.IO.Path]::GetDirectoryName((Get-Command python).Source)) "LICENSE.txt") -Destination (Join-Path $licenseResourceDir "Python-PSF-LICENSE.txt")
}
Copy-Item -LiteralPath (Join-Path $root "node_modules\@tauri-apps\api\LICENSE_APACHE-2.0") -Destination (Join-Path $licenseResourceDir "Apache-2.0.txt")
Copy-Item -LiteralPath (Join-Path $root "node_modules\@tauri-apps\api\LICENSE_MIT") -Destination (Join-Path $licenseResourceDir "Tauri-MIT.txt")

Write-Host "Desktop sidecar and bundled resources are ready."
