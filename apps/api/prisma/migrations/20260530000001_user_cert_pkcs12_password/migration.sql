-- Add encrypted PKCS12 password to user_client_certs.
-- The column stores an AES-256-GCM ciphertext produced by apps/api/src/lib/encrypt.ts.
-- Existing rows get NULL — the password reveal button is hidden when the field is null.
ALTER TABLE "user_client_certs"
  ADD COLUMN "pkcs12Password" VARCHAR(512);
