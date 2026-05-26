// ─────────────────────────────────────────────────────────────────────
//  Seed script — bootstrap a working dev environment.
//
//  Idempotent: re-running upserts the same records and does not
//  destroy user-created data. Run via `pnpm db:seed`.
// ─────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { hashPassword, ntHash } from "../src/lib/password.js";
import { syncGroupToRadius, syncUserToRadius } from "../src/services/radiusPolicy.js";

const prisma = new PrismaClient();

async function main() {
  // ── Default groups ────────────────────────────────────────────────
  const staff = await prisma.group.upsert({
    where: { name: "Staff" },
    update: {},
    create: {
      name: "Staff",
      description: "Default employee group — VLAN 20",
      isDefault: true,
      attributes: {
        create: [
          { attribute: "Tunnel-Type", op: ":=", value: "VLAN", kind: "reply" },
          { attribute: "Tunnel-Medium-Type", op: ":=", value: "IEEE-802", kind: "reply" },
          { attribute: "Tunnel-Private-Group-Id", op: ":=", value: "20", kind: "reply" },
          { attribute: "Session-Timeout", op: ":=", value: "28800", kind: "reply" },
        ],
      },
    },
  });

  const guest = await prisma.group.upsert({
    where: { name: "Guest" },
    update: {},
    create: {
      name: "Guest",
      description: "Captive guest network — VLAN 99",
      attributes: {
        create: [
          { attribute: "Tunnel-Type", op: ":=", value: "VLAN", kind: "reply" },
          { attribute: "Tunnel-Medium-Type", op: ":=", value: "IEEE-802", kind: "reply" },
          { attribute: "Tunnel-Private-Group-Id", op: ":=", value: "99", kind: "reply" },
          { attribute: "Session-Timeout", op: ":=", value: "3600", kind: "reply" },
        ],
      },
    },
  });

  // ── Bootstrap admin ───────────────────────────────────────────────
  // CHANGE THE PASSWORD AFTER FIRST LOGIN. The architecture doc
  // mandates Argon2id at rest + NT-hash for RADIUS sync; both are
  // produced in a single transaction below.
  const adminUsername = "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234!";

  const passwordHashArgon2id = await hashPassword(adminPassword);
  const nthash = ntHash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      email: "admin@example.local",
      fullName: "Platform Administrator",
      role: "admin",
      status: "active",
      secret: {
        create: {
          passwordHashArgon2id,
          ntHash: nthash,
          mustChangePassword: true,
        },
      },
      groups: {
        create: { groupId: staff.id, priority: 1 },
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await syncGroupToRadius(tx, staff.id);
    await syncGroupToRadius(tx, guest.id);
    await syncUserToRadius(tx, admin.id);
  });

  console.log("Seed complete.");
  console.log(`  Admin: ${adminUsername} / ${adminPassword}  (change on first login)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
