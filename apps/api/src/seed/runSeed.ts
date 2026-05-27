import { PrismaClient } from "@prisma/client";
import { hashPassword, ntHash } from "../lib/password.js";
import { syncGroupToRadius, syncNasToRadius, syncUserToRadius } from "../services/radiusPolicy.js";

const prisma = new PrismaClient();

function writeSeedLine(message: string) {
  process.stdout.write(`${message}\n`);
}

export async function runSeed() {
  const staff = await prisma.group.upsert({
    where: { name: "Staff" },
    update: {},
    create: {
      name: "Staff",
      description: "Default employee group - VLAN 20",
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
      description: "Captive guest network - VLAN 99",
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

  const adminUsername = "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234!";
  const testUsername = process.env.SEED_TEST_USERNAME ?? "wifi-test";
  const testPassword = process.env.SEED_TEST_USER_PASSWORD ?? "wifi12345!";

  const passwordHashArgon2id = await hashPassword(adminPassword);
  const nthash = ntHash(adminPassword);
  const testPasswordHash = await hashPassword(testPassword);
  const testNtHash = ntHash(testPassword);

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

  const testUser = await prisma.user.upsert({
    where: { username: testUsername },
    update: {},
    create: {
      username: testUsername,
      email: `${testUsername}@example.local`,
      fullName: "WiFi Test User",
      role: "user",
      status: "active",
      secret: {
        create: {
          passwordHashArgon2id: testPasswordHash,
          ntHash: testNtHash,
          mustChangePassword: false,
        },
      },
      groups: {
        create: { groupId: staff.id, priority: 1 },
      },
    },
  });

  const seededNasIp = process.env.SEED_LAB_NAS_IP?.trim();
  const seededNasSecret = process.env.SEED_LAB_NAS_SECRET?.trim() || "testing123radiuslab";
  const seededNasShortname = process.env.SEED_LAB_NAS_SHORTNAME?.trim() || "lab-ap";
  const seededNasType = process.env.SEED_LAB_NAS_VENDOR?.trim() || "other";
  const seededNasCoaPort = Number(process.env.SEED_LAB_NAS_COA_PORT ?? "3799");

  const nas = seededNasIp
    ? await prisma.nasClient.upsert({
        where: { nasname: seededNasIp },
        update: {},
        create: {
          nasname: seededNasIp,
          shortname: seededNasShortname,
          secret: seededNasSecret,
          type: seededNasType,
          enabled: true,
          coaPort: Number.isFinite(seededNasCoaPort) ? seededNasCoaPort : 3799,
          description: "Seeded lab AP for field validation",
        },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await syncGroupToRadius(tx, staff.id);
    await syncGroupToRadius(tx, guest.id);
    await syncUserToRadius(tx, admin.id);
    await syncUserToRadius(tx, testUser.id);
    if (nas) {
      await syncNasToRadius(tx, nas.id);
    }
  });

  writeSeedLine("Seed complete.");
  writeSeedLine(`  Admin: ${adminUsername} / ${adminPassword}  (change on first login)`);
  writeSeedLine(`  Test user: ${testUsername} / ${testPassword}`);
  if (nas) {
    writeSeedLine(`  NAS: ${nas.nasname} / secret ${seededNasSecret} / CoA ${nas.coaPort}`);
  } else {
    writeSeedLine("  NAS: skipped (set SEED_LAB_NAS_IP to seed your AP entry)");
  }
}

export async function runSeedWithCleanup() {
  try {
    await runSeed();
  } finally {
    await prisma.$disconnect();
  }
}
