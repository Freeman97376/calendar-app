param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
  throw "Version must be a semantic version such as 0.2.1."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $root
try {
  npm.cmd version $Version --no-git-tag-version --allow-same-version
  if ($LASTEXITCODE -ne 0) { throw "npm version failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$cargoText = [System.IO.File]::ReadAllText($cargoPath)
$cargoPattern = '(?ms)(^\[package\].*?^version\s*=\s*")[^"]+(".*?$)'
$cargoUpdated = [regex]::Replace($cargoText, $cargoPattern, "`${1}$Version`${2}", 1)
if ($cargoUpdated -eq $cargoText -and $cargoText -notmatch "(?m)^version\s*=\s*`"$([regex]::Escape($Version))`"") {
  throw "Unable to update src-tauri/Cargo.toml."
}
[System.IO.File]::WriteAllText($cargoPath, $cargoUpdated, $utf8NoBom)

$cargoLockPath = Join-Path $root "src-tauri\Cargo.lock"
$cargoLockText = [System.IO.File]::ReadAllText($cargoLockPath)
$cargoLockPattern = '(?ms)(^\[\[package\]\]\s+name\s*=\s*"calendar-app"\s+version\s*=\s*")[^"]+(".*?$)'
$cargoLockUpdated = [regex]::Replace($cargoLockText, $cargoLockPattern, "`${1}$Version`${2}", 1)
if ($cargoLockUpdated -eq $cargoLockText -and $cargoLockText -notmatch "(?ms)^\[\[package\]\]\s+name\s*=\s*`"calendar-app`"\s+version\s*=\s*`"$([regex]::Escape($Version))`"") {
  throw "Unable to update src-tauri/Cargo.lock."
}
[System.IO.File]::WriteAllText($cargoLockPath, $cargoLockUpdated, $utf8NoBom)

$tauriPath = Join-Path $root "src-tauri\tauri.conf.json"
$tauriText = [System.IO.File]::ReadAllText($tauriPath)
$tauriUpdated = [regex]::Replace(
  $tauriText,
  '("version"\s*:\s*")[^"]+("\s*,)',
  [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $match.Groups[1].Value + $Version + $match.Groups[2].Value },
  1
)
if ($tauriUpdated -eq $tauriText -and $tauriText -notmatch "`"version`"\s*:\s*`"$([regex]::Escape($Version))`"") {
  throw "Unable to update src-tauri/tauri.conf.json."
}
[System.IO.File]::WriteAllText($tauriPath, $tauriUpdated, $utf8NoBom)

& (Join-Path $PSScriptRoot "check-version.ps1")
Write-Host "Calendar App version set to $Version. Commit these changes before creating tag v$Version."
