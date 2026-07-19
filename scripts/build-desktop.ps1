$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
& (Join-Path $PSScriptRoot "check-version.ps1")
& (Join-Path $PSScriptRoot "prepare-desktop.ps1")

$localSigningKey = Join-Path $root "calendar-app-updater.key"
$localSigningPassword = Join-Path $root ".secrets\updater-password.txt"
$restoreSigningKey = $env:TAURI_SIGNING_PRIVATE_KEY
$restoreSigningPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$setLocalSigningKey = -not $env:TAURI_SIGNING_PRIVATE_KEY
$setLocalSigningPassword = -not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if ($setLocalSigningKey) {
  if (-not (Test-Path -LiteralPath $localSigningKey)) {
    throw "Updater signing key is missing. Set TAURI_SIGNING_PRIVATE_KEY to the private key path or content."
  }
  $env:TAURI_SIGNING_PRIVATE_KEY = $localSigningKey
}
if ($setLocalSigningPassword) {
  if (-not (Test-Path -LiteralPath $localSigningPassword)) {
    throw "Updater signing password is missing. Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD or restore .secrets/updater-password.txt."
  }
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -LiteralPath $localSigningPassword -Raw).Trim()
}

Push-Location $root
try {
  npm.cmd exec tauri build -- --bundles nsis
  if ($LASTEXITCODE -ne 0) { throw "Tauri build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  if ($setLocalSigningKey) {
    if ($null -eq $restoreSigningKey) {
      Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    } else {
      $env:TAURI_SIGNING_PRIVATE_KEY = $restoreSigningKey
    }
  }
  if ($setLocalSigningPassword) {
    if ($null -eq $restoreSigningPassword) {
      Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    } else {
      $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $restoreSigningPassword
    }
  }
}

& (Join-Path $PSScriptRoot "package-desktop.ps1")
