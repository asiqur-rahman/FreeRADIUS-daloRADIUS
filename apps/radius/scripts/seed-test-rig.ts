// ─────────────────────────────────────────────────────────────────────
//  Seed the database with the rows our test-rig clients need:
//   - a NAS row at 127.0.0.1 with a known shared secret
//   - a user "wifitester" with a known password (Argon2id + NT-hash)
//
//  Idempotent — running it twice is fine; existing rows are updated
//  rather than duplicated. Safe to re-run after each `pnpm db:migrate`.
//
//  Usage:
//    pnpm --filter @app/radius run rig:seed
// ─────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const TEST_USER = {
  username: "wifitester",
  email: "wifitester@example.local",
  fullName: "WiFi Test User",
  password: "TestPassw0rd!", // matches the test client's hard-coded password
};

const TEST_NAS = {
  // 0.0.0.0/0 — CIDR matching every IPv4 source. For the test rig we
  // want any device on the network (this laptop, your router, a CLI
  // supplicant on another box) to be able to talk to the radius server
  // without enumerating each one. The lookup query in src/nas.ts
  // recognises CIDRs via Postgres' `inet <<= nasname::inet` operator.
  //
  // Override via env (TEST_NAS_NAME=192.168.1.1) if you want a tighter
  // bind during a specific debug session.
  nasname: process.env.TEST_NAS_NAME ?? "0.0.0.0/0",
  shortname: "test-rig",
  secret: "testing-secret-32chars-loremipsum", // ≥16 chars
  type: "other",
};

function ntHash(password: string): string {
  // NT-hash = MD4(UTF-16LE(password)) — Node's built-in utf16le encoder
  // matches the apps/api implementation byte-for-byte (no BOM, plain
  // little-endian 16-bit code units).
  return createHash("md4")
    .update(Buffer.from(password, "utf16le"))
    .digest("hex")
    .toUpperCase();
}

async function main() {
  console.log("─── Seeding test rig data ──────────────────────────────");

  // 1) Test user
  const argonHash = await argon2.hash(TEST_USER.password, { type: argon2.argon2id });
  const nth = ntHash(TEST_USER.password);

  const user = await prisma.user.upsert({
    where: { username: TEST_USER.username },
    create: {
      username: TEST_USER.username,
      email: TEST_USER.email,
      fullName: TEST_USER.fullName,
      role: "user",
      status: "active",
      secret: {
        create: {
          passwordHashArgon2id: argonHash,
          ntHash: nth,
        },
      },
    },
    update: {
      email: TEST_USER.email,
      fullName: TEST_USER.fullName,
      status: "active",
      secret: {
        upsert: {
          create: { passwordHashArgon2id: argonHash, ntHash: nth },
          update: {
            passwordHashArgon2id: argonHash,
            ntHash: nth,
            failedAttempts: 0,
            lockedUntil: null,
          },
        },
      },
    },
  });
  console.log(`✓ user "${user.username}" (id=${user.id})`);
  console.log(`  password: ${TEST_USER.password}`);
  console.log(`  NT-hash:  ${nth}`);

  // 2) Test NAS — re-seeded each time keyed by shortname so changes
  //    to TEST_NAS.nasname (e.g. 127.0.0.1 → 0.0.0.0/0) don't leave
  //    stale rows behind.
  const previous = await prisma.nasClient.findMany({
    where: { shortname: TEST_NAS.shortname },
    select: { id: true, nasname: true },
  });
  if (previous.length) {
    await prisma.nasClient.deleteMany({ where: { shortname: TEST_NAS.shortname } });
    for (const p of previous) {
      await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${p.nasname};`;
    }
  }

  const nas = await prisma.nasClient.create({
    data: {
      nasname: TEST_NAS.nasname,
      shortname: TEST_NAS.shortname,
      secret: TEST_NAS.secret,
      type: TEST_NAS.type,
      enabled: true,
    },
  });
  console.log(`✓ NAS "${nas.shortname}" @ ${nas.nasname}`);
  console.log(`  secret:   ${nas.secret}`);

  // 3) Make sure the radius `nas` table mirrors the row (FreeRADIUS-compat).
  //    Normally RadiusPolicyService.syncNasToRadius handles this; for the
  //    seed we run the equivalent SQL directly.
  await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${nas.nasname};`;
  await prisma.$executeRaw`
    INSERT INTO nas (nasname, shortname, type, secret, description)
    VALUES (${nas.nasname}, ${nas.shortname}, ${nas.type}, ${nas.secret}, 'test rig');
  `;
  console.log("✓ radius nas table synced");
  if (nas.nasname.includes("/")) {
    console.log("  ℹ️  CIDR — any IP within this range can talk to the radius server");
  }

  console.log("");
  console.log("─── Ready to test ─────────────────────────────────────");
  console.log("In one shell:  cd apps/radius && $env:PEAP_ENABLED='true'; pnpm dev");
  console.log("In another:    pnpm --filter @app/radius run rig:test-peap");
  console.log("");
}

main()
  .catch((err) => {
    console.error("seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
