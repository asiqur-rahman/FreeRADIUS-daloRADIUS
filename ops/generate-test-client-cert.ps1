param(
  [string]$CaCertPath = ".\ops\dev-ca\device-ca.pem",
  [string]$CaKeyPath = ".\ops\dev-ca\device-ca.key",
  [string]$OutDir = ".\ops\dev-ca\clients",
  [string]$CommonName = "wifi-test-device",
  [string]$Email = "wifi-test@example.local",
  [string]$Organization = "RadiusOps",
  [string]$OrganizationalUnit = "Managed WiFi",
  [int]$KeySize = 2048,
  [int]$ValidityDays = 365,
  [string]$PfxPassword,
  [string]$BaseName,
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

function Get-PemBytes {
  param([string]$Pem)

  $base64 = (($Pem -split "`r?`n") | Where-Object { $_ -and -not $_.StartsWith("-----") }) -join ""
  return [Convert]::FromBase64String($base64)
}

function Import-RsaPrivateKeyFromPem {
  param([string]$Pem)

  $bytes = Get-PemBytes $Pem
  $key = [System.Security.Cryptography.CngKey]::Import($bytes, [System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
  return [System.Security.Cryptography.RSACng]::new($key)
}

function Assert-WritableTarget {
  param([string]$Path)

  if ((Test-Path $Path) -and -not $Force) {
    throw "Refusing to overwrite existing file: $Path (pass -Force to replace it)"
  }
}

function New-Password {
  $bytes = New-Object byte[] 18
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "B")
}

function Get-SafeFileStem {
  param([string]$Value)

  $safe = ($Value -replace "[^A-Za-z0-9._-]", "-").Trim("-")
  if ([string]::IsNullOrWhiteSpace($safe)) {
    return "device"
  }
  return $safe
}

if (-not (Test-Path $CaCertPath)) {
  throw "CA certificate not found: $CaCertPath"
}
if (-not (Test-Path $CaKeyPath)) {
  throw "CA private key not found: $CaKeyPath"
}

$resolvedOutDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutDir))
[System.IO.Directory]::CreateDirectory($resolvedOutDir) | Out-Null

$fileStem = Get-SafeFileStem $(if ([string]::IsNullOrWhiteSpace($BaseName)) { $CommonName } else { $BaseName })
$certPath = Join-Path $resolvedOutDir "$fileStem.pem"
$keyPath = Join-Path $resolvedOutDir "$fileStem.key"
$pfxPath = Join-Path $resolvedOutDir "$fileStem.pfx"
Assert-WritableTarget $certPath
Assert-WritableTarget $keyPath
Assert-WritableTarget $pfxPath

$caCertPem = Get-Content -Path $CaCertPath -Raw
$caKeyPem = Get-Content -Path $CaKeyPath -Raw
$caCertBytes = [byte[]](Get-PemBytes $caCertPem)
$caCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @(,$caCertBytes)
$caKey = Import-RsaPrivateKeyFromPem $caKeyPem

$subjectParts = @("CN=$CommonName")
if ($Organization.Trim()) {
  $subjectParts += "O=$Organization"
}
if ($OrganizationalUnit.Trim()) {
  $subjectParts += "OU=$OrganizationalUnit"
}
if ($Email.Trim()) {
  $subjectParts += "E=$Email"
}
$subject = ($subjectParts -join ", ")

$clientKey = [System.Security.Cryptography.RSACng]::new($KeySize)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  $subject,
  $clientKey,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature `
      -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
    $true
  )
)
$eku = New-Object System.Security.Cryptography.OidCollection
[void]$eku.Add((New-Object System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.2")))
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku, $false)
)
if ($Email.Trim()) {
  $sanBuilder = New-Object System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
  $sanBuilder.AddEmailAddress($Email)
  $request.CertificateExtensions.Add($sanBuilder.Build())
}
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false)
)

$signatureGenerator = [System.Security.Cryptography.X509Certificates.X509SignatureGenerator]::CreateForRSA(
  $caKey,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$serial = New-Object byte[] 16
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($serial)
if ($serial[0] -eq 0) {
  $serial[0] = 1
}

$notBefore = [DateTimeOffset]::UtcNow.AddMinutes(-5)
$notAfter = $notBefore.AddDays($ValidityDays)
$issued = $request.Create($caCert.SubjectName, $signatureGenerator, $notBefore, $notAfter, $serial)
$certificate = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($issued, $clientKey)

$clientCertPem = Convert-ToPem -Label "CERTIFICATE" -Bytes $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$clientKeyPem = Convert-ToPem -Label "PRIVATE KEY" -Bytes $clientKey.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
$resolvedPfxPassword = if ([string]::IsNullOrWhiteSpace($PfxPassword)) { New-Password } else { $PfxPassword }
$pfxBytes = $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $resolvedPfxPassword)

[System.IO.File]::WriteAllText($certPath, $clientCertPem, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText($keyPath, $clientKeyPem, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)

Write-Host "Generated test client certificate" -ForegroundColor Green
Write-Host ""
Write-Host ("Certificate PEM: {0}" -f $certPath)
Write-Host ("Private key PEM: {0}" -f $keyPath)
Write-Host ("PKCS#12 / PFX: {0}" -f $pfxPath)
Write-Host ("PFX password: {0}" -f $resolvedPfxPassword)
Write-Host ""
Write-Host ("Subject: {0}" -f $certificate.Subject)
Write-Host ("Issuer:  {0}" -f $certificate.Issuer)
Write-Host ""
Write-Host "Use this flow for EAP-TLS field testing:" -ForegroundColor Cyan
Write-Host ("1. Import {0} into the device approval workspace for the target device." -f $certPath)
Write-Host ("2. Install {0} on the supplicant with the password above." -f $pfxPath)
Write-Host ("3. Trust the CA at {0} on the supplicant or controller if required." -f (Resolve-Path $CaCertPath).Path)
