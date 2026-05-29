param(
  [string]$ServerIp,
  [string]$NasIp = $env:SEED_LAB_NAS_IP,
  [string]$NasSecret = $env:SEED_LAB_NAS_SECRET,
  [string]$ApiUrl = "http://localhost:4000",
  [string]$DashboardUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"

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

function Get-CandidateServerIps {
  try {
    return @(
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
          $_.IPAddress -notlike "127.*" -and
          $_.IPAddress -notlike "169.254.*"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
    )
  } catch {
    return @()
  }
}

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host $Title -ForegroundColor Cyan
}

function Write-Kv {
  param(
    [string]$Label,
    [string]$Value
  )

  Write-Host ("{0,-28} {1}" -f "${Label}:", $Value)
}

$rootEnv = Read-EnvFile ".env"
$testUsername = $env:SEED_TEST_USERNAME
if ([string]::IsNullOrWhiteSpace($testUsername)) {
  $testUsername = "wifi-test"
}

$testPassword = $env:SEED_TEST_USER_PASSWORD
if ([string]::IsNullOrWhiteSpace($testPassword)) {
  $testPassword = "wifi12345!"
}

$resolvedServerIp = $ServerIp
$candidateIps = @()
if ([string]::IsNullOrWhiteSpace($resolvedServerIp)) {
  $candidateIps = @(Get-CandidateServerIps)
  if ($candidateIps.Count -gt 0) {
    $resolvedServerIp = $candidateIps[0]
  }
}

if ([string]::IsNullOrWhiteSpace($resolvedServerIp)) {
  $resolvedServerIp = "<pass -ServerIp with your LAN address>"
}

if ([string]::IsNullOrWhiteSpace($NasSecret)) {
  $NasSecret = "<set -NasSecret or SEED_LAB_NAS_SECRET>"
}

if ([string]::IsNullOrWhiteSpace($NasIp)) {
  $NasIp = "<set -NasIp or seed later>"
}

Write-Host "RadiusOps lab configuration summary" -ForegroundColor Green

Write-Section "Router / AP settings"
Write-Kv "RADIUS auth server" $resolvedServerIp
Write-Kv "Authentication port" "1812/udp"
Write-Kv "Accounting server" $resolvedServerIp
Write-Kv "Accounting port" "1813/udp"
Write-Kv "CoA / Disconnect port" "3799/udp"
Write-Kv "NAS / AP IP" $NasIp
Write-Kv "Shared secret" $NasSecret

Write-Section "VLAN / policy"
Write-Kv "VLAN assignment" "Set Tunnel-* reply attributes per group in Admin -> Groups"
Write-Kv "Groups" "Family (full access) . Guest (default, restricted) . add more as needed"

Write-Section "Bootstrap identities"
Write-Kv "PEAP test user" $testUsername
Write-Kv "PEAP test password" $testPassword
Write-Kv "Dashboard" $DashboardUrl
Write-Kv "API readiness" "$ApiUrl/health/ready"

if ($candidateIps.Count -gt 1) {
  Write-Section "Detected server IPs"
  foreach ($candidateIp in $candidateIps) {
    Write-Host " - $candidateIp"
  }
  Write-Host "Use the address that your router can actually reach."
}

Write-Section "Seed NAS row"
Write-Host '$env:SEED_LAB_NAS_IP="<router-ip>"'
Write-Host '$env:SEED_LAB_NAS_SECRET="<radius-shared-secret>"'
Write-Host "pnpm db:seed"

Write-Section "Reminder"
Write-Host "Keep the server machine on Ethernet or a separate network while testing enterprise Wi-Fi."
