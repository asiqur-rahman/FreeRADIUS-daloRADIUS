-- ── NAC device schema + no-history cert cleanup ──────────────────────
--
-- Plan B: device profiling (manufacturer, deviceType, lastIp)
--         three-state decisions (blocked)
--         decision metadata moved onto user_devices
--         Telegram sync fields moved onto user_devices
--
-- Plan C: remove DeviceApproval history table
--         remove revokedAt from user_client_certs (cert deleted on revoke)

-- 1. New enums
CREATE TYPE "DeviceType" AS ENUM (
  'laptop', 'mobile', 'tablet', 'iot', 'printer',
  'network', 'gaming', 'tv', 'unknown'
);

-- 2. Add blocked to DeviceStatus (PostgreSQL allows adding, not removing)
ALTER TYPE "DeviceStatus" ADD VALUE 'blocked';

-- 3. Add audit actions for block/unblock
ALTER TYPE "AuditAction" ADD VALUE 'device_block';
ALTER TYPE "AuditAction" ADD VALUE 'device_unblock';

-- 4. Add new columns to user_devices
ALTER TABLE "user_devices"
  ADD COLUMN "manufacturer"      VARCHAR(128),
  ADD COLUMN "deviceType"        "DeviceType" NOT NULL DEFAULT 'unknown',
  ADD COLUMN "lastIp"            VARCHAR(45),
  ADD COLUMN "decidedAt"         TIMESTAMPTZ,
  ADD COLUMN "decidedBy"         VARCHAR(30),
  ADD COLUMN "decisionNote"      VARCHAR(500),
  ADD COLUMN "telegramChatId"    BIGINT,
  ADD COLUMN "telegramMessageId" INTEGER;

-- 5. Migrate existing DeviceApproval data into user_devices before dropping
--    (copy latest decision per device so no data is fully lost in upgrade)
UPDATE "user_devices" ud
SET
  "decidedAt"   = da."decidedAt",
  "decidedBy"   = da."decidedBy",
  "decisionNote" = da.notes
FROM (
  SELECT DISTINCT ON ("deviceId")
    "deviceId", "decidedAt", "decidedBy", notes
  FROM "device_approvals"
  WHERE "decidedAt" IS NOT NULL
  ORDER BY "deviceId", "decidedAt" DESC
) da
WHERE ud.id = da."deviceId";

-- Also migrate Telegram message IDs from the most recent pending approval
UPDATE "user_devices" ud
SET
  "telegramChatId"    = da."telegramChatId",
  "telegramMessageId" = da."telegramMessageId"
FROM (
  SELECT DISTINCT ON ("deviceId")
    "deviceId", "telegramChatId", "telegramMessageId"
  FROM "device_approvals"
  WHERE "telegramMessageId" IS NOT NULL
  ORDER BY "deviceId", "requestedAt" DESC
) da
WHERE ud.id = da."deviceId";

-- 6. Drop the old history table
DROP TABLE IF EXISTS "device_approvals";

-- 7. Remove revokedAt from user_client_certs
--    (certs are now deleted on revocation — no revokedAt needed)
ALTER TABLE "user_client_certs" DROP COLUMN IF EXISTS "revokedAt";
