import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword, ntHash } from "../lib/password.js";
import { syncGroupToRadius, syncNasToRadius, syncUserToRadius } from "../services/radiusPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedConfig = JSON.parse(
  readFileSync(resolve(__dirname, "../../prisma/seed.config.json"), "utf8")
);

const prisma = new PrismaClient();

function writeSeedLine(message: string) {
  process.stdout.write(`${message}\n`);
}

export async function runSeed() {
  // No Session-Timeout on Staff or Family — sessions are unlimited unless
  // the admin explicitly adds the attribute via the group editor.
  const staff = await prisma.group.upsert({
    where: { name: "Staff" },
    update: { description: "Default employee group", isDefault: true },
    create: {
      name: "Staff",
      description: "Default employee group",
      isDefault: true,
    },
  });

  // Guest is unlimited by default too.  Admin can add Session-Timeout or set
  // validUntil on individual guest user accounts.
  const guest = await prisma.group.upsert({
    where: { name: "Guest" },
    update: { description: "Guest access" },
    create: {
      name: "Guest",
      description: "Guest access",
    },
  });

  const family = await prisma.group.upsert({
    where: { name: "Family" },
    update: { description: "Family / home members" },
    create: {
      name: "Family",
      description: "Family / home members",
    },
  });

  const { username: adminUsername, password: adminPassword, email: adminEmail, fullName: adminFullName } = seedConfig.admin;
  const { username: testUsername, password: testPassword, email: testEmail, fullName: testFullName } = seedConfig.testUser;

  // Remove any stale user that holds the same email but a different username
  // (handles the case where the admin username was renamed in seed.config.json)
  await prisma.user.deleteMany({ where: { email: adminEmail, NOT: { username: adminUsername } } });
  await prisma.user.deleteMany({ where: { email: testEmail,  NOT: { username: testUsername  } } });

  const passwordHashArgon2id = await hashPassword(adminPassword);
  const nthash = ntHash(adminPassword);
  const testPasswordHash = await hashPassword(testPassword);
  const testNtHash = ntHash(testPassword);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      email: adminEmail,
      fullName: adminFullName,
      secret: {
        update: {
          passwordHashArgon2id,
          ntHash: nthash,
        },
      },
    },
    create: {
      username: adminUsername,
      email: adminEmail,
      fullName: adminFullName,
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
    update: {
      email: testEmail,
      fullName: testFullName,
      secret: {
        update: {
          passwordHashArgon2id: testPasswordHash,
          ntHash: testNtHash,
        },
      },
    },
    create: {
      username: testUsername,
      email: testEmail,
      fullName: testFullName,
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

  const nasIp = seedConfig.nas.ip?.trim();
  const nas = nasIp
    ? await prisma.nasClient.upsert({
        where: { nasname: nasIp },
        update: {},
        create: {
          nasname: nasIp,
          shortname: seedConfig.nas.shortname,
          secret: seedConfig.nas.secret,
          type: seedConfig.nas.vendor,
          enabled: true,
          coaPort: seedConfig.nas.coaPort,
          description: seedConfig.nas.description,
        },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await syncGroupToRadius(tx, staff.id);
    await syncGroupToRadius(tx, guest.id);
    await syncGroupToRadius(tx, family.id);
    await syncUserToRadius(tx, admin.id);
    await syncUserToRadius(tx, testUser.id);
    if (nas) {
      await syncNasToRadius(tx, nas.id);
    }
  });

  writeSeedLine("Seed complete.");
  writeSeedLine(`  Admin    : ${adminUsername} / ${adminPassword}  (change on first login)`);
  writeSeedLine(`  Test user: ${testUsername} / ${testPassword}`);
  if (nas) {
    writeSeedLine(`  NAS      : ${nas.nasname} / secret ${seedConfig.nas.secret} / CoA ${nas.coaPort}`);
  } else {
    writeSeedLine("  NAS      : skipped (set nas.ip in prisma/seed.config.json to seed your AP)");
  }
}

export async function runSeedWithCleanup() {
  try {
    await runSeed();
  } finally {
    await prisma.$disconnect();
  }
}
