param(
  [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
$ready = Invoke-RestMethod -Uri "$BaseUrl/health/ready" -Method Get
if ($ready.status -ne "ready") {
  throw "API readiness check failed"
}

& docker compose -f docker-compose.yml -f docker-compose.production.yml ps
Write-Host "API readiness confirmed."
