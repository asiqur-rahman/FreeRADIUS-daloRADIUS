-- ─────────────────────────────────────────────────────────────────────
--  Migration: radius_ip_allowlist
--
--  Adds:
--    - radius_allowed_ips table (RADIUS hook source-IP guard)
--    - AuditAction values for allowlist CRUD
-- ─────────────────────────────────────────────────────────────────────

-- AlterEnum (PostgreSQL requires separate statements per value)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'radius_ip_create';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'radius_ip_delete';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'radius_ip_update';

-- CreateTable
CREATE TABLE "radius_allowed_ips" (
    "id" TEXT NOT NULL,
    "cidr" VARCHAR(50) NOT NULL,
    "label" VARCHAR(80),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radius_allowed_ips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "radius_allowed_ips_cidr_key" ON "radius_allowed_ips"("cidr");
