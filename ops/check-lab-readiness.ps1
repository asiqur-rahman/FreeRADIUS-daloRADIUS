param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$WebUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

function Write-Check {
  param(
    [ValidateSet("PASS", "WARN", "FAIL")]
    [string]$Status,
    [string]$Name,
    [string]$Detail
  )

  $color = switch ($Status) {
    "PASS" { "Green" }
    "WARN" { "Yellow" }
    "FAIL" { "Red" }
  }

  Write-Host ("[{0}] {1} - {2}" -f $Status, $Name, $Detail) -ForegroundColor $color
}

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path $Path)) {
    return $values
  }

  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim().TrimStart([char]0xFEFF)
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $parts = $trimmed -split "=", 2
    if ($parts.Count -eq 2) {
      $key = $parts[0].Trim()
      $value = $parts[1].Trim()
      $isQuoted = ($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))
      if ($isQuoted) {
        $value = $value.Substring(1, $value.Length - 2)
      } else {
        $value = [regex]::Replace($value, "\s+#.*$", "").Trim()
      }
      $values[$key] = $value
    }
  }

  return $values
}

function Convert-ToWslPath {
  param([string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath -match "^(?<drive>[A-Za-z]):\\(?<rest>.*)$") {
    $drive = $Matches["drive"].ToLowerInvariant()
    $rest = $Matches["rest"] -replace "\\", "/"
    if ([string]::IsNullOrWhiteSpace($rest)) {
      return "/mnt/$drive"
    }
    return "/mnt/$drive/$rest"
  }

  throw "Unable to convert path to WSL format: $Path"
}

function Get-ComposeRunningServices {
  if (-not $script:DockerRuntime) {
    return @()
  }

  try {
    if ($script:DockerRuntime.Mode -eq "native") {
      $output = & docker compose -f docker-compose.yml -f docker-compose.production.yml ps --services --status running 2>$null
    } else {
      $bashCommand = "cd '$script:RepoRootWsl' && docker compose -f docker-compose.yml -f docker-compose.production.yml ps --services --status running"
      $output = & wsl.exe bash -lc $bashCommand 2>$null
    }

    if ($LASTEXITCODE -ne 0) {
      return @()
    }

    return @($output | Where-Object { $_.Trim() })
  } catch {
    return @()
  }
}

function Test-HttpJson {
  param([string]$Url)

  try {
    return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5
  } catch {
    return $null
  }
}

function Test-CommandAvailable {
  param([string]$CommandName)

  return [bool](Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Get-DockerRuntime {
  try {
    $nativeVersion = & docker --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $nativeVersion) {
      return @{
        Mode = "native"
        Version = ($nativeVersion | Out-String).Trim()
      }
    }
  } catch {
  }

  if (Test-CommandAvailable "wsl.exe") {
    try {
      $wslVersion = & wsl.exe bash -lc "docker --version" 2>$null
      if ($LASTEXITCODE -eq 0 -and $wslVersion) {
        return @{
          Mode = "wsl"
          Version = ($wslVersion | Out-String).Trim()
        }
      }
    } catch {
    }
  }

  return $null
}

function Invoke-ExternalCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()

  try {
    $process = Start-Process -FilePath $FilePath `
      -ArgumentList $Arguments `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    return @{
      ExitCode = $process.ExitCode
      Stdout = if (Test-Path $stdoutPath) { Get-Content -Path $stdoutPath -Raw } else { "" }
      Stderr = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath -Raw } else { "" }
    }
  } finally {
    Remove-Item -Path $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
  }
}

function Get-PrismaCliPath {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\apps\api\node_modules\prisma\build\index.js"),
    (Join-Path $PSScriptRoot "..\node_modules\prisma\build\index.js")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Prisma CLI entrypoint not found"
}

function Get-DatabaseTarget {
  param([string]$DatabaseUrl)

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    return $null
  }

  try {
    $uri = [System.Uri]$DatabaseUrl
    return @{
      Host = $uri.Host
      Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    }
  } catch {
    return $null
  }
}

function Test-TcpPort {
  param(
    [string]$Hostname,
    [int]$Port
  )

  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($Hostname, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1500, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-PrismaFailureDetail {
  param(
    [string]$Stdout,
    [string]$Stderr,
    [hashtable]$DatabaseTarget
  )

  if ($DatabaseTarget -and -not (Test-TcpPort -Hostname $DatabaseTarget.Host -Port $DatabaseTarget.Port)) {
    return "database not reachable at $($DatabaseTarget.Host):$($DatabaseTarget.Port); start Postgres or verify DATABASE_URL"
  }

  $lines = @($Stdout, $Stderr) `
    -split "`r?`n" |
    ForEach-Object { $_.Trim() } |
    Where-Object {
      $_ -and
      $_ -notmatch "^Environment variables loaded from" -and
      $_ -notmatch "^Prisma schema loaded from"
    }

  if ($lines.Count -eq 0) {
    return "migrate status failed"
  }

  if ($lines[0] -eq "Error: Schema engine error:" -and $lines.Count -gt 1) {
    return $lines[-1]
  }

  return $lines[0]
}

function Invoke-PostgresScalar {
  param(
    [string]$Password,
    [string]$User,
    [string]$Database,
    [string]$Sql
  )

  $output = $null

  if ($script:DockerRuntime.Mode -eq "native") {
    $output = & docker exec radius-postgres env "PGPASSWORD=$Password" psql -h 127.0.0.1 -U $User -d $Database -tAc $Sql 2>$null
  } elseif ($script:DockerRuntime.Mode -eq "wsl") {
    $result = Invoke-ExternalCommand -FilePath "wsl.exe" -Arguments @(
      "docker",
      "exec",
      "radius-postgres",
      "env",
      "PGPASSWORD=$Password",
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      $User,
      "-d",
      $Database,
      "-tAc",
      $Sql
    )
    $output = $result.Stdout
    $script:LastExitCode = $result.ExitCode
  }

  $exitCode = if ($script:DockerRuntime.Mode -eq "wsl") { $script:LastExitCode } else { $LASTEXITCODE }
  if ($exitCode -ne 0 -or [string]::IsNullOrWhiteSpace(($output | Out-String))) {
    throw "psql query failed"
  }

  return ($output | Out-String).Trim()
}

function Invoke-ApiHealthFallback {
  if (-not $script:DockerRuntime) {
    return $null
  }

  try {
    if ($script:DockerRuntime.Mode -eq "native") {
      $output = & docker exec freeradius-api-1 wget -q -O - http://127.0.0.1:4000/health/ready 2>$null
    } else {
      $bashCommand = "docker exec freeradius-api-1 wget -q -O - http://127.0.0.1:4000/health/ready"
      $output = & wsl.exe bash -lc $bashCommand 2>$null
    }

    if ($LASTEXITCODE -ne 0 -or -not $output) {
      return $null
    }

    return ($output | Out-String | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Test-WebHealthFallback {
  param([string]$Url)

  if (-not $script:DockerRuntime) {
    return $false
  }

  try {
    if ($script:DockerRuntime.Mode -eq "native") {
      $response = Invoke-WebRequest -Uri "$Url/web-health" -Method Get -TimeoutSec 5 -UseBasicParsing
      return $response.StatusCode -eq 200
    }

    $bashCommand = "curl -fsS '$Url/web-health'"
    $output = & wsl.exe bash -lc $bashCommand 2>$null
    return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($output | Out-String))
  } catch {
    return $false
  }
}

function Invoke-ContainerPrismaStatus {
  if (-not $script:DockerRuntime) {
    return $null
  }

  if ($script:DockerRuntime.Mode -eq "native") {
    $output = & docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api node node_modules/prisma/build/index.js migrate status 2>$null
    return @{
      ExitCode = $LASTEXITCODE
      Stdout = ($output | Out-String)
      Stderr = ""
    }
  }

  $bashCommand = "cd '$script:RepoRootWsl' && docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api node node_modules/prisma/build/index.js migrate status"
  $result = Invoke-ExternalCommand -FilePath "wsl.exe" -Arguments @("bash", "-lc", $bashCommand)
  return @{
    ExitCode = $result.ExitCode
    Stdout = $result.Stdout
    Stderr = $result.Stderr
  }
}

$rootEnv = Read-EnvFile ".env"
$apiEnv = Read-EnvFile "apps/api/.env"
$script:RepoRootWsl = Convert-ToWslPath (Join-Path $PSScriptRoot "..")
$script:DockerRuntime = Get-DockerRuntime
$failures = 0

Write-Host "RadiusOps lab readiness check" -ForegroundColor Cyan
Write-Host ""

foreach ($path in @(".env", "apps/api/.env")) {
  if (Test-Path $path) {
    Write-Check PASS $path "found"
  } else {
    Write-Check FAIL $path "missing"
    $failures++
  }
}

$requiredRoot = @(
  "DATABASE_URL",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "MFA_ENCRYPTION_KEY",
  "RADIUS_HOOK_SECRET",
  "QUARANTINE_VLAN_ID",
  "NORMAL_VLAN_ID"
)

foreach ($key in $requiredRoot) {
  if ([string]::IsNullOrWhiteSpace($rootEnv[$key])) {
    Write-Check FAIL "env:$key" "missing in .env"
    $failures++
  } else {
    Write-Check PASS "env:$key" "set"
  }
}

foreach ($key in @("DATABASE_URL", "RADIUS_HOOK_SECRET", "QUARANTINE_VLAN_ID", "NORMAL_VLAN_ID")) {
  if ([string]::IsNullOrWhiteSpace($apiEnv[$key])) {
    Write-Check WARN "apps/api/.env:$key" "not set locally"
    continue
  }

  if ($rootEnv.ContainsKey($key) -and $rootEnv[$key] -ne $apiEnv[$key]) {
    Write-Check WARN "apps/api/.env:$key" "differs from root .env"
  } else {
    Write-Check PASS "apps/api/.env:$key" "aligned"
  }
}

$telegramConfigured = -not [string]::IsNullOrWhiteSpace($apiEnv["TELEGRAM_BOT_TOKEN"]) -and
  -not [string]::IsNullOrWhiteSpace($apiEnv["TELEGRAM_ADMIN_CHAT_ID"])
if ($telegramConfigured) {
  Write-Check PASS "Telegram" "bot token and admin chat id configured"
} else {
  Write-Check WARN "Telegram" "not configured; dashboard approval still works"
}

function Test-CaMaterialConfigured {
  param([hashtable]$EnvValues)

  return (
    -not [string]::IsNullOrWhiteSpace($EnvValues["DEVICE_CERT_CA_CERT_PATH"]) -and
    -not [string]::IsNullOrWhiteSpace($EnvValues["DEVICE_CERT_CA_KEY_PATH"])
  ) -or (
    -not [string]::IsNullOrWhiteSpace($EnvValues["DEVICE_CERT_CA_CERT_PEM"]) -and
    -not [string]::IsNullOrWhiteSpace($EnvValues["DEVICE_CERT_CA_KEY_PEM"])
  )
}

function Resolve-ConfiguredPath {
  param(
    [string]$BaseDirectory,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return $CandidatePath
  }

  return [System.IO.Path]::GetFullPath((Join-Path $BaseDirectory $CandidatePath))
}

function Get-MissingCaPaths {
  param(
    [hashtable]$EnvValues,
    [string]$BaseDirectory
  )

  $missing = @()

  foreach ($entry in @(
    @{ Key = "DEVICE_CERT_CA_CERT_PATH"; Label = "cert" },
    @{ Key = "DEVICE_CERT_CA_KEY_PATH"; Label = "key" }
  )) {
    $value = $EnvValues[$entry.Key]
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }

    $resolved = Resolve-ConfiguredPath -BaseDirectory $BaseDirectory -CandidatePath $value
    if (-not (Test-Path $resolved)) {
      $missing += "$($entry.Label) path missing: $value"
    }
  }

  return $missing
}

$rootCaConfigured = Test-CaMaterialConfigured $rootEnv
$apiCaConfigured = Test-CaMaterialConfigured $apiEnv
$deviceCaConfigured = $rootCaConfigured -or $apiCaConfigured
if ($deviceCaConfigured) {
  $missingCaPaths = @()
  if ($rootCaConfigured) {
    $missingCaPaths += Get-MissingCaPaths -EnvValues $rootEnv -BaseDirectory (Get-Location).Path
  }
  if ($apiCaConfigured) {
    $missingCaPaths += Get-MissingCaPaths -EnvValues $apiEnv -BaseDirectory (Join-Path (Get-Location).Path "apps/api")
  }

  if ($missingCaPaths.Count -gt 0) {
    Write-Check FAIL "Device CA material" ($missingCaPaths -join "; ")
    $failures++
  } else {
  $scope = if ($apiCaConfigured -and $rootCaConfigured) {
    "root .env and apps/api/.env"
  } elseif ($apiCaConfigured) {
    "apps/api/.env"
  } else {
    "root .env"
  }
  Write-Check PASS "Device CA material" "configured via $scope"
  }
} else {
  Write-Check WARN "Device CA material" "not configured; run pnpm lab:device-ca for a local EAP-TLS lab CA"
}

$opensslAvailable = Test-CommandAvailable "openssl"
if ($opensslAvailable) {
  Write-Check PASS "OpenSSL CLI" "available for dashboard-issued client certificates"
} elseif ($deviceCaConfigured) {
  Write-Check WARN "OpenSSL CLI" "missing; local import-based EAP-TLS works, but dashboard-issued certs stay unavailable"
} else {
  Write-Check WARN "OpenSSL CLI" "missing; install it before relying on dashboard-issued client certificates"
}

$dockerVersion = $script:DockerRuntime
if ($dockerVersion) {
  $detail = if ($dockerVersion.Mode -eq "wsl") {
    "$($dockerVersion.Version) via WSL"
  } else {
    $dockerVersion.Version
  }
  Write-Check PASS "Docker" $detail
} else {
  Write-Check FAIL "Docker" "docker CLI not available"
  $failures++
}

$runningServices = Get-ComposeRunningServices
foreach ($service in @("postgres", "freeradius")) {
  if ($runningServices -contains $service) {
    Write-Check PASS "docker:$service" "running"
  } else {
    Write-Check WARN "docker:$service" "not running via docker compose"
  }
}

$apiReady = Test-HttpJson "$ApiUrl/health/ready"
if (-not $apiReady) {
  $apiReady = Invoke-ApiHealthFallback
}
if ($apiReady -and $apiReady.status -eq "ready") {
  $detail = if ($ApiUrl -eq "http://localhost:4000") {
    "ready"
  } else {
    "$ApiUrl/health/ready"
  }
  Write-Check PASS "API readiness" $detail
} else {
  Write-Check WARN "API readiness" "API not responding at $ApiUrl"
}

$webHealth = $null
try {
  $webHealth = Invoke-WebRequest -Uri "$WebUrl/web-health" -Method Get -TimeoutSec 5
} catch {
  $webHealth = $null
}
if (($webHealth -and $webHealth.StatusCode -eq 200) -or (Test-WebHealthFallback -Url $WebUrl)) {
  Write-Check PASS "Web health" "$WebUrl/web-health"
} else {
  Write-Check WARN "Web health" "web container not responding at $WebUrl"
}

$prismaCli = $null
$schemaPath = Join-Path $PSScriptRoot "..\apps\api\prisma\schema.prisma"
$databaseTarget = Get-DatabaseTarget $rootEnv["DATABASE_URL"]
$dbStatus = $null

try {
  $prismaCli = Get-PrismaCliPath
  $dbStatus = Invoke-ExternalCommand -FilePath "node" -Arguments @($prismaCli, "migrate", "status", "--schema", $schemaPath)
} catch {
  $dbStatus = $null
}

if (($null -eq $dbStatus -or $dbStatus.ExitCode -ne 0) -and $script:DockerRuntime) {
  $containerStatus = Invoke-ContainerPrismaStatus
  if ($containerStatus) {
    $dbStatus = $containerStatus
  }
}

if ($dbStatus -and $dbStatus.ExitCode -eq 0) {
  Write-Check PASS "Prisma migrations" "schema status command succeeded"
} elseif ($dbStatus) {
  $detail = Get-PrismaFailureDetail -Stdout $dbStatus.Stdout -Stderr $dbStatus.Stderr -DatabaseTarget $databaseTarget
  Write-Check FAIL "Prisma migrations" $detail
  $failures++
} else {
  Write-Check FAIL "Prisma migrations" "Prisma CLI could not run"
  $failures++
}

if ($runningServices -contains "postgres") {
  try {
    $postgresPassword = if ([string]::IsNullOrWhiteSpace($rootEnv["POSTGRES_PASSWORD"])) { "radius_dev_password_change_me" } else { $rootEnv["POSTGRES_PASSWORD"] }
    $dbName = if ([string]::IsNullOrWhiteSpace($rootEnv["POSTGRES_DB"])) { "radius" } else { $rootEnv["POSTGRES_DB"] }
    $postgresUser = if ([string]::IsNullOrWhiteSpace($rootEnv["POSTGRES_USER"])) { "radius" } else { $rootEnv["POSTGRES_USER"] }
    $appUser = if ([string]::IsNullOrWhiteSpace($rootEnv["APP_DB_USER"])) { "app_user" } else { $rootEnv["APP_DB_USER"] }
    $appPassword = if ([string]::IsNullOrWhiteSpace($rootEnv["APP_DB_PASSWORD"])) { "app_user_dev_password" } else { $rootEnv["APP_DB_PASSWORD"] }

    $deviceApprovalsExists = Invoke-PostgresScalar -Password $postgresPassword -User $postgresUser -Database $dbName -Sql "SELECT to_regclass('public.device_approvals') IS NOT NULL;"
    if ($deviceApprovalsExists -eq "t") {
      Write-Check PASS "DB table:device_approvals" "present"
    } else {
      Write-Check FAIL "DB table:device_approvals" "missing"
      $failures++
    }

    $statusColumnExists = Invoke-PostgresScalar -Password $postgresPassword -User $postgresUser -Database $dbName -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_devices' AND column_name = 'status');"
    if ($statusColumnExists -eq "t") {
      Write-Check PASS "DB column:user_devices.status" "present"
    } else {
      Write-Check FAIL "DB column:user_devices.status" "missing"
      $failures++
    }

    $nasCount = Invoke-PostgresScalar -Password $appPassword -User $appUser -Database $dbName -Sql "SELECT COUNT(*) FROM nas_clients;"
    if ([int]$nasCount -gt 0) {
      Write-Check PASS "NAS clients" "$nasCount row(s)"
    } else {
      Write-Check WARN "NAS clients" "no AP/NAS rows yet"
    }

    $ntHashCount = Invoke-PostgresScalar -Password $appPassword -User $appUser -Database $dbName -Sql "SELECT COUNT(*) FROM user_secrets WHERE to_jsonb(user_secrets)->>'ntHash' IS NOT NULL AND length(to_jsonb(user_secrets)->>'ntHash') = 32;"
    if ([int]$ntHashCount -gt 0) {
      Write-Check PASS "Users with NT hash" "$ntHashCount row(s)"
    } else {
      Write-Check FAIL "Users with NT hash" "no MSCHAPv2-capable users found"
      $failures++
    }

    $activeEapCerts = Invoke-PostgresScalar -Password $appPassword -User $appUser -Database $dbName -Sql "SELECT COUNT(*) FROM eap_certificates WHERE COALESCE((to_jsonb(eap_certificates)->>'isActive')::boolean, false) = true;"
    if ([int]$activeEapCerts -gt 0) {
      Write-Check PASS "Active EAP server cert inventory" "$activeEapCerts active"
    } else {
      Write-Check WARN "Active EAP server cert inventory" "no active inventory record yet"
    }
  } catch {
    Write-Check WARN "Database checks" $_.Exception.Message
  }
}

Write-Host ""
if ($failures -gt 0) {
  Write-Host "Lab readiness failed with $failures blocking issue(s)." -ForegroundColor Red
  exit 1
}

Write-Host "Lab readiness passed. Remaining WARN items are optional or environment-specific." -ForegroundColor Green
