$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$compose = Join-Path $root "docker-compose.mysql-test.yml"
$env:CALENDAR_MYSQL_TEST_URL = "mysql+pymysql://calendar_test:calendar_test@127.0.0.1:33306/calendar_test?charset=utf8mb4"

function Assert-CommandSucceeded([string]$label) {
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE." }
}

Push-Location $root
try {
  docker compose -f $compose up -d --wait
  Assert-CommandSucceeded "docker compose up"
  python -m alembic -x "database_url=$env:CALENDAR_MYSQL_TEST_URL" upgrade head
  Assert-CommandSucceeded "Alembic MySQL migration"
  python -m unittest tests.backend.test_mysql_contract
  Assert-CommandSucceeded "MySQL contract tests"
} finally {
  docker compose -f $compose down --volumes
  if ($LASTEXITCODE -ne 0) { Write-Warning "Docker cleanup could not contact the Docker daemon." }
  Pop-Location
}
