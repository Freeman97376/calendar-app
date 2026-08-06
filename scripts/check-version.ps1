$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$packageLockPath = Join-Path $root "package-lock.json"
$packageLockVersionsJson = & node -e "const p=require(process.argv[1]); console.log(JSON.stringify([p.version,p.packages[''].version]))" $packageLockPath
if ($LASTEXITCODE -ne 0) { throw "Unable to read package-lock.json with Node.js." }
$packageLockVersions = $packageLockVersionsJson | ConvertFrom-Json
$tauriConfig = Get-Content -LiteralPath (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$cargoText = Get-Content -LiteralPath (Join-Path $root "src-tauri\Cargo.toml") -Raw
$cargoMatch = [regex]::Match($cargoText, '(?ms)^\[package\].*?^version\s*=\s*"([^"]+)"')
$cargoLockText = Get-Content -LiteralPath (Join-Path $root "src-tauri\Cargo.lock") -Raw
$cargoLockMatch = [regex]::Match($cargoLockText, '(?ms)^\[\[package\]\]\s+name\s*=\s*"calendar-app"\s+version\s*=\s*"([^"]+)"')

if (-not $cargoMatch.Success -or -not $cargoLockMatch.Success) {
  throw "Unable to read the application version from the Cargo manifest or lock file."
}

$versions = [ordered]@{
  "package.json" = [string]$package.version
  "package-lock.json" = [string]$packageLockVersions[0]
  "package-lock.json root package" = [string]$packageLockVersions[1]
  "src-tauri/tauri.conf.json" = [string]$tauriConfig.version
  "src-tauri/Cargo.toml" = [string]$cargoMatch.Groups[1].Value
  "src-tauri/Cargo.lock" = [string]$cargoLockMatch.Groups[1].Value
}
$expected = [string]$package.version

foreach ($entry in $versions.GetEnumerator()) {
  if ($entry.Value -ne $expected) {
    throw "Version mismatch: $($entry.Key) is $($entry.Value), expected $expected. Run npm.cmd run version:set -- <version>."
  }
}

if ($env:GITHUB_REF_TYPE -eq "tag" -and $env:GITHUB_REF_NAME) {
  $expectedTag = "v$expected"
  if ($env:GITHUB_REF_NAME -ne $expectedTag) {
    throw "Release tag $($env:GITHUB_REF_NAME) does not match application version $expectedTag."
  }
}

Write-Host "Version check passed: $expected"
