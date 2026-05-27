-- Add audit actions introduced by the device approval workflow.
ALTER TYPE "AuditAction" ADD VALUE 'device_approve';
ALTER TYPE "AuditAction" ADD VALUE 'device_reject';

-- Device approval state for user_devices.
CREATE TYPE "DeviceStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "user_devices"
ADD COLUMN "status" "DeviceStatus" NOT NULL DEFAULT 'pending';

-- Devices that predate the approval workflow were already trusted by the
-- platform, so preserve their behavior during migration.
UPDATE "user_devices"
SET "status" = 'approved';

CREATE INDEX "user_devices_status_idx" ON "user_devices"("status");

-- Decision history for first-seen / managed devices.
CREATE TABLE "device_approvals" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'pending',
    "notes" VARCHAR(500),

    CONSTRAINT "device_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_approvals_status_requestedAt_idx" ON "device_approvals"("status", "requestedAt");

ALTER TABLE "device_approvals"
ADD CONSTRAINT "device_approvals_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "user_devices"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_approvals"
ADD CONSTRAINT "device_approvals_decidedBy_fkey"
FOREIGN KEY ("decidedBy") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
