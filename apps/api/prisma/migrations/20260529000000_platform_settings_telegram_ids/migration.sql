-- Add Telegram message reference columns to device_approvals
-- so web-side approvals can edit the pending Telegram notification.
ALTER TABLE "device_approvals"
  ADD COLUMN "telegramChatId"    BIGINT,
  ADD COLUMN "telegramMessageId" INTEGER;

-- Platform settings: DB-backed key-value store for runtime configuration.
CREATE TABLE "platform_settings" (
  "key"       VARCHAR(128) NOT NULL,
  "value"     TEXT         NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
