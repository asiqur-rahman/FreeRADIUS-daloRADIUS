-- Add per-user certificate access control flag.
-- true (default) = user can generate/use WiFi certificates.
-- false = user is blocked from cert provisioning at the API level.
ALTER TABLE "users" ADD COLUMN "certEnabled" BOOLEAN NOT NULL DEFAULT true;
