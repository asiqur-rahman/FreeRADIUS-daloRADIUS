-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'suspended', 'expired');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('user_create', 'user_update', 'user_delete', 'user_reset_password', 'user_disconnect', 'password_change', 'group_create', 'group_update', 'group_delete', 'nas_create', 'nas_update', 'nas_delete', 'nas_rotate_secret', 'site_create', 'site_update', 'site_delete', 'cert_add', 'cert_activate', 'cert_delete', 'login_success', 'login_failure', 'mfa_enable', 'mfa_disable');

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('login_ok', 'login_fail', 'radius_accept', 'radius_reject');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "fullName" VARCHAR(120),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" VARCHAR(255),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_secrets" (
    "userId" TEXT NOT NULL,
    "passwordHashArgon2id" VARCHAR(255) NOT NULL,
    "ntHash" VARCHAR(32) NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "user_secrets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mac" VARCHAR(17) NOT NULL,
    "label" VARCHAR(80),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "certFingerprint" VARCHAR(64),
    "learnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_attributes" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "attribute" VARCHAR(64) NOT NULL,
    "op" VARCHAR(2) NOT NULL,
    "value" VARCHAR(253) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,

    CONSTRAINT "group_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "nas_clients" (
    "id" TEXT NOT NULL,
    "nasname" VARCHAR(128) NOT NULL,
    "shortname" VARCHAR(32) NOT NULL,
    "secret" VARCHAR(60) NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'other',
    "description" VARCHAR(200),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "coaPort" INTEGER NOT NULL DEFAULT 3799,
    "siteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nas_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "region" VARCHAR(64),
    "address" VARCHAR(255),

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" VARCHAR(32) NOT NULL,
    "targetId" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(45),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" VARCHAR(64) NOT NULL,
    "type" "AuthEventType" NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_certificates" (
    "id" TEXT NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "issuer" VARCHAR(255),
    "fingerprint" VARCHAR(64) NOT NULL,
    "serial" VARCHAR(80),
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eap_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "hash" VARCHAR(128) NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_devices_mac_idx" ON "user_devices"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_mac_key" ON "user_devices"("userId", "mac");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "group_attributes_groupId_attribute_kind_key" ON "group_attributes"("groupId", "attribute", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "nas_clients_nasname_key" ON "nas_clients"("nasname");

-- CreateIndex
CREATE UNIQUE INDEX "sites_name_key" ON "sites"("name");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "auth_events_createdAt_idx" ON "auth_events"("createdAt");

-- CreateIndex
CREATE INDEX "auth_events_username_createdAt_idx" ON "auth_events"("username", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "eap_certificates_fingerprint_key" ON "eap_certificates"("fingerprint");

-- CreateIndex
CREATE INDEX "eap_certificates_expiresAt_idx" ON "eap_certificates"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_hash_key" ON "api_tokens"("hash");

-- AddForeignKey
ALTER TABLE "user_secrets" ADD CONSTRAINT "user_secrets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_attributes" ADD CONSTRAINT "group_attributes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nas_clients" ADD CONSTRAINT "nas_clients_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
