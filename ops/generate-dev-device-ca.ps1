param(
  [string]$OutDir = ".\ops\dev-ca",
  [string]$ApiEnvPath = ".\apps\api\.env",
  [string]$CommonName = "RadiusOps Dev Device CA",
  [string]$Organization = "RadiusOps",
  [string]$OrganizationalUnit = "Managed WiFi",
  [int]$KeySize = 2048,
  [int]$ValidityYears = 5,
  [switch]$SkipApiEnvUpdate,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Convert-ToPem {
  param(
    [string]$Label,
    [byte[]]$Bytes
  )

  $base64 = [Convert]::ToBase64String($Bytes)
  $chunks = ($base64 -split "(.{1,64})" | Where-Object { $_ }) -join "`n"
  return "-----BEGIN $Label-----`n$chunks`n-----END $Label-----`n"
}

function Assert-WritableTarget {
  param([string]$Path)

  if ((Test-Path $Path) -and -not $Force) {
    throw "Refusing to overwrite existing file: $Path (pass -Force to replace it)"
  }
}

function Get-RelativePath {
  param(
    [string]$FromDirectory,
    [string]$ToPath
  )

  $fromUri = [System.Uri]((Resolve-Path $FromDirectory).Path.TrimEnd("\") + "\")
  $toUri = [System.Uri]((Resolve-Path $ToPath).Path)
  return [System.Uri]::UnescapeDataString($fromUri.MakeRelativeUri($toUri).ToString()).Replace("/", "\")
}

function Set-EnvFileValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = New-Object "System.Collections.Generic.List[string]"
  if (Test-Path $Path) {
    foreach ($line in Get-Content -Path $Path) {
      $lines.Add($line)
    }
  }
  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    if ($lines.Count -gt 0 -and $lines[$lines.Count - 1].Trim()) {
      $lines.Add("")
    }
    $lines.Add("$Key=$Value")
  }

  [System.IO.File]::WriteAllLines($Path, $lines, [System.Text.Encoding]::UTF8)
}

$resolvedOutDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutDir))
[System.IO.Directory]::CreateDirectory($resolvedOutDir) | Out-Null

$certPath = Join-Path $resolvedOutDir "device-ca.pem"
$keyPath = Join-Path $resolvedOutDir "device-ca.key"
Assert-WritableTarget $certPath
Assert-WritableTarget $keyPath

$subjectParts = @("CN=$CommonName")
if ($Organization.Trim()) {
  $subjectParts += "O=$Organization"
}
if ($OrganizationalUnit.Trim()) {
  $subjectParts += "OU=$OrganizationalUnit"
}
$subject = ($subjectParts -join ", ")

$key = [System.Security.Cryptography.RSACng]::new($KeySize)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  $subject,
  $key,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $true)
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign `
      -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign `
      -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
    $true
  )
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false)
)

$notBefore = [DateTimeOffset]::UtcNow.AddMinutes(-5)
$notAfter = $notBefore.AddYears($ValidityYears)
$certificate = $request.CreateSelfSigned($notBefore, $notAfter)

$certificatePem = Convert-ToPem -Label "CERTIFICATE" -Bytes $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$keyPem = Convert-ToPem -Label "PRIVATE KEY" -Bytes $key.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)

[System.IO.File]::WriteAllText($certPath, $certificatePem, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText($keyPath, $keyPem, [System.Text.Encoding]::ASCII)

$apiEnvCertPath = Get-RelativePath -FromDirectory ".\apps\api" -ToPath $certPath
$apiEnvKeyPath = Get-RelativePath -FromDirectory ".\apps\api" -ToPath $keyPath

if (-not $SkipApiEnvUpdate) {
  $resolvedApiEnvPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ApiEnvPath))
  Set-EnvFileValue -Path $resolvedApiEnvPath -Key "DEVICE_CERT_CA_CERT_PATH" -Value $apiEnvCertPath
  Set-EnvFileValue -Path $resolvedApiEnvPath -Key "DEVICE_CERT_CA_KEY_PATH" -Value $apiEnvKeyPath
}

Write-Host "Generated local device CA" -ForegroundColor Green
Write-Host ""
Write-Host ("Certificate: {0}" -f $certPath)
Write-Host ("Private key: {0}" -f $keyPath)
Write-Host ""
if ($SkipApiEnvUpdate) {
  Write-Host "Add these lines to apps/api/.env for local dashboard-issued client certs:" -ForegroundColor Cyan
} else {
  Write-Host ("Updated {0} with local device-CA paths." -f ([System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ApiEnvPath)))) -ForegroundColor Cyan
  Write-Host "Current apps/api/.env values:" -ForegroundColor Cyan
}
Write-Host ("DEVICE_CERT_CA_CERT_PATH={0}" -f $apiEnvCertPath)
Write-Host ("DEVICE_CERT_CA_KEY_PATH={0}" -f $apiEnvKeyPath)
Write-Host ""
Write-Host "Then generate a test client cert with:" -ForegroundColor Cyan
Write-Host ("pnpm lab:client-cert -- -CaCertPath `"{0}`" -CaKeyPath `"{1}`"" -f $certPath, $keyPath)
