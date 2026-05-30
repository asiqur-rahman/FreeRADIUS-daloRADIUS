param(
  [string]$OutputDirectory = ".backups",
  [string]$Database = "radius",
  [string]$User = "radius"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputRoot = Join-Path (Get-Location) $OutputDirectory
$outputPath = Join-Path $outputRoot "radius-$timestamp.dump"
$containerPath = "/tmp/radius-$timestamp.dump"
$compose = @("-f", "docker-compose.yml", "-f", "docker-compose.production.yml")

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
& docker compose @compose exec -T postgres pg_dump -U $User -d $Database --format=custom --file=$containerPath
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

& docker compose @compose cp "postgres:$containerPath" $outputPath
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup from postgres container" }

& docker compose @compose exec -T postgres rm -f $containerPath
Write-Host "Backup created: $outputPath"
