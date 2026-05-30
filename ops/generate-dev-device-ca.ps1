param(
  [string]$OutDir = ".\ops\dev-ca",
  [string]$CommonName = "RadiusOps Dev Device CA",
  [string]$Organization = "RadiusOps",
  [string]$OrganizationalUnit = "Managed WiFi",
  [int]$KeySize = 2048,
  [int]$ValidityYears = 5,
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

Write-Host ""
Write-Host "RadiusOps — Device CA Generator" -ForegroundColor White
Write-Host ""

$resolvedOutDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutDir))
[System.IO.Directory]::CreateDirectory($resolvedOutDir) | Out-Null

$certPath = Join-Path $resolvedOutDir "ca.pem"
$keyPath  = Join-Path $resolvedOutDir "ca.key"
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

Write-Host ("  Generating RSA-{0} key pair…" -f $KeySize) -ForegroundColor Cyan

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

$notBefore  = [DateTimeOffset]::UtcNow.AddMinutes(-5)
$notAfter   = $notBefore.AddYears($ValidityYears)
$certificate = $request.CreateSelfSigned($notBefore, $notAfter)

$certificatePem = Convert-ToPem -Label "CERTIFICATE" -Bytes $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$keyPem         = Convert-ToPem -Label "PRIVATE KEY"  -Bytes $key.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)

Write-Host ("  Signing CA certificate ({0} years)…" -f $ValidityYears) -ForegroundColor Cyan

[System.IO.File]::WriteAllText($certPath, $certificatePem, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText($keyPath,  $keyPem,         [System.Text.Encoding]::ASCII)

Write-Host ("✓ Cert → {0}" -f $certPath) -ForegroundColor Green
Write-Host ("✓ Key  → {0}" -f $keyPath)  -ForegroundColor Green
Write-Host ""

# Quick sanity — print subject and validity from the generated cert
$x509 = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Text.Encoding]::ASCII.GetBytes($certificatePem))
Write-Host ("  Subject : {0}" -f $x509.Subject)    -ForegroundColor Cyan
Write-Host ("  Not Before: {0}" -f $x509.NotBefore) -ForegroundColor Cyan
Write-Host ("  Not After : {0}" -f $x509.NotAfter)  -ForegroundColor Cyan
Write-Host ""

Write-Host "Done." -ForegroundColor White
Write-Host ""
Write-Host "Next step — upload the CA to the admin panel:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open the admin dashboard"
Write-Host ("  2. Go to  Admin → Settings → CA Certificate")
Write-Host ("  3. Paste the contents of  {0}  into `"CA Certificate`"" -f $certPath)
Write-Host ("  4. Paste the contents of  {0}  into `"CA Private Key`""  -f $keyPath)
Write-Host "  5. Click Save"
Write-Host ""
Write-Host "Or, if you just want auto-generated certs, click `"Generate`" in the admin panel — no script needed."
Write-Host ""
