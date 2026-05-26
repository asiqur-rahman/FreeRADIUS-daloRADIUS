param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$Database = "radius",
  [string]$User = "radius"
)

$ErrorActionPreference = "Stop"
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$containerPath = "/tmp/radius-restore.dump"
$compose = @("-f", "docker-compose.yml", "-f", "docker-compose.production.yml")

$confirmation = Read-Host "Restore will replace current database objects. Type RESTORE to continue"
if ($confirmation -ne "RESTORE") {
  throw "Restore cancelled"
}

& docker compose @compose cp $resolvedBackup "postgres:$containerPath"
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup to postgres container" }

& docker compose @compose exec -T postgres pg_restore -U $User -d $Database --clean --if-exists --no-owner $containerPath
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }

& docker compose @compose exec -T postgres rm -f $containerPath
Write-Host "Restore complete: $resolvedBackup"
