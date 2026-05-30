-- Add 'guest' value to UserRole enum
-- PostgreSQL 12+ allows this inside a transaction.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'guest';

-- Store the certificate PEM in user_client_certs so users can re-download
-- their public cert later (private key is still never stored).
ALTER TABLE "user_client_certs" ADD COLUMN "certPem" TEXT;

-- Add SHA-1 fingerprint to EAP server certificates.
-- Windows 11 WPA2-Enterprise "Trusted certificate thumbprints" requires SHA-1
-- (not SHA-256). Stored alongside the existing SHA-256 fingerprint.
ALTER TABLE "eap_certificates" ADD COLUMN "fingerprintSha1" VARCHAR(40);
