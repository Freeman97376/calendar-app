param(
  [switch]$IncludeServerE2E
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$compose = Join-Path $root "docker-compose.mysql-test.yml"
$pythonResolver = Join-Path $root "scripts/python-executable.mjs"
$pythonOutput = @(& node $pythonResolver)
if ($LASTEXITCODE -ne 0) {
  throw "Locked test Python resolution failed with exit code $LASTEXITCODE."
}
$python = [string]($pythonOutput | Select-Object -Last 1)
if ([string]::IsNullOrWhiteSpace($python) -or -not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "Locked test Python resolver did not return an executable file."
}
$env:CALENDAR_MYSQL_TEST_URL = "mysql+pymysql://calendar_test:calendar_test@127.0.0.1:33306/calendar_test?charset=utf8mb4"

function Assert-CommandSucceeded([string]$label) {
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE." }
}

function Get-AvailableTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

Push-Location $root
$primaryError = $null
$cleanupError = $null
try {
  docker compose -f $compose up -d --wait
  Assert-CommandSucceeded "docker compose up"
  & $python -m alembic -x "database_url=$env:CALENDAR_MYSQL_TEST_URL" upgrade head
  Assert-CommandSucceeded "Alembic MySQL migration"
  & $python -m unittest discover Office/test/backend -p "test_mysql_contract.py"
  Assert-CommandSucceeded "MySQL contract tests"
  if ($IncludeServerE2E) {
    if (-not $env:CALENDAR_E2E_WEB_PORT) { $env:CALENDAR_E2E_WEB_PORT = Get-AvailableTcpPort }
    if (-not $env:CALENDAR_E2E_API_PORT) {
      do { $env:CALENDAR_E2E_API_PORT = Get-AvailableTcpPort } while ($env:CALENDAR_E2E_API_PORT -eq $env:CALENDAR_E2E_WEB_PORT)
    }
    $env:CALENDAR_E2E_DATABASE_URL = $env:CALENDAR_MYSQL_TEST_URL
    npm.cmd run test:e2e:server
    Assert-CommandSucceeded "Server E2E tests"
  }
} catch {
  $primaryError = $_
} finally {
  try {
    docker compose -f $compose down --volumes
    if ($LASTEXITCODE -ne 0) {
      $cleanupError = "Docker cleanup failed with exit code $LASTEXITCODE; test resources may remain."
    }
  } catch {
    $cleanupError = $_
  } finally {
    Pop-Location
  }
}

if ($null -ne $primaryError) {
  if ($null -ne $cleanupError) {
    Write-Warning "Docker cleanup also failed: $cleanupError"
  }
  throw $primaryError
}
if ($null -ne $cleanupError) {
  throw $cleanupError
}
