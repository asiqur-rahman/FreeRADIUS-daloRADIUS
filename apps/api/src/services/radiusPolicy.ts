// ─────────────────────────────────────────────────────────────────────
//  RadiusPolicyService — the *only* code path allowed to mutate
//  FreeRADIUS tables (radcheck/radreply/radgroupcheck/radgroupreply/
//  radusergroup/nas).
//
//  Discipline (architecture doc §4.3 & §8):
//   1. Every privileged operation is wrapped in a single Prisma
//      transaction that mutates BOTH the app table AND the RADIUS
//      table(s). No partial state.
//   2. Operators are explicit: ':=' (set) for assignments, '==' (compare)
//      for check conditions. Using the wrong operator on NT-Password
//      silently breaks MSCHAPv2.
//   3. Side effects (CoA disconnect, notifications) run *outside* the
//      transaction with fire-and-track semantics.
//
//  Phase-1 scope: password change → radcheck.NT-Password sync,
//  user create/disable → radcheck rows + radusergroup mapping,
//  group attribute write-through → radgroupcheck / radgroupreply.
//  Phase 3 CoA dispatch lives in sessions.ts/coa.ts; automatic policy
//  triggers after account mutations remain to be configured.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword, ntHash } from "../lib/password.js";
import { NotFound } from "../lib/errors.js";
import { config } from "../config.js";
import { disconnectForPolicyChange } from "./sessions.js";

type Tx = Prisma.TransactionClient;

// ── Helpers ────────────────────────────────────────────────────────

async function upsertRadcheck(
  tx: Tx,
  username: string,
  attribute: string,
  value: string,
  op: ":=" | "==" = ":=",
) {
  // Single statement: insert if absent, update value+op if present.
  // The radcheck table has no native unique on (username, attribute),
  // so we emulate idempotency by deleting then inserting in one tx.
  await tx.$executeRaw`
    DELETE FROM radcheck WHERE username = ${username} AND attribute = ${attribute};
  `;
  await tx.$executeRaw`
    INSERT INTO radcheck (username, attribute, op, value)
    VALUES (${username}, ${attribute}, ${op}, ${value});
  `;
}

async function deleteRadcheckRows(tx: Tx, username: string) {
  await tx.$executeRaw`DELETE FROM radcheck WHERE username = ${username};`;
  await tx.$executeRaw`DELETE FROM radreply  WHERE username = ${username};`;
  await tx.$executeRaw`DELETE FROM radusergroup WHERE username = ${username};`;
}

async function syncUserGroupMapping(tx: Tx, username: string, groupNames: string[]) {
  await tx.$executeRaw`DELETE FROM radusergroup WHERE username = ${username};`;
  for (let i = 0; i < groupNames.length; i++) {
    const name = groupNames[i]!;
    await tx.$executeRaw`
      INSERT INTO radusergroup (username, groupname, priority)
      VALUES (${username}, ${name}, ${i + 1});
    `;
  }
}

// ── Public API ─────────────────────────────────────────────────────

interface PasswordChangeOpts {
  userId: string;
  newPassword: string;
  actorId: string;
  req?: FastifyRequest;
  mustChange?: boolean;
}

/**
 * Rewrites the user's web-auth hash + RADIUS NT-hash in a single tx.
 * Side effects (CoA disconnect of existing sessions, email notice)
 * fire outside the tx after commit.
 */
export async function changeUserPassword(opts: PasswordChangeOpts) {
  const argon2id = await hashPassword(opts.newPassword);
  const nthash = ntHash(opts.newPassword);

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw NotFound("User not found");

  await prisma.$transaction(async (tx) => {
    await tx.userSecret.upsert({
      where: { userId: opts.userId },
      update: {
        passwordHashArgon2id: argon2id,
        ntHash: nthash,
        passwordChangedAt: new Date(),
        mustChangePassword: opts.mustChange ?? false,
        tokenVersion: { increment: 1 },
        failedAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: opts.userId,
        passwordHashArgon2id: argon2id,
        ntHash: nthash,
        mustChangePassword: opts.mustChange ?? false,
        tokenVersion: 1,
      },
    });

    await upsertRadcheck(tx, user.username, "NT-Password", nthash, ":=");
    // Auth-Type pinning is optional but defensive — forces the EAP path
    // to consult NT-Password rather than letting FreeRADIUS auto-pick.
    await upsertRadcheck(tx, user.username, "Auth-Type", "EAP", ":=");
  });

  // ── side-effects ───────────────────────────────────────────────
  if (config().COA_DISCONNECT_ON_PASSWORD_CHANGE) {
    await disconnectForPolicyChange({
      userId: opts.userId,
      actorId: opts.actorId,
      reason: "password_change",
      req: opts.req,
    });
  }
}

/**
 * Synchronise the RADIUS-side state for a user from the app-side state.
 * Idempotent — safe to call after any change that affects what RADIUS
 * needs to see (status, expiry, group membership).
 */
export async function syncUserToRadius(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      secret: true,
      groups: { include: { group: true }, orderBy: { priority: "asc" } },
    },
  });
  if (!user) throw NotFound("User not found");

  // Suspended / expired → wipe RADIUS rows so the user is rejected at
  // the SQL lookup. Cheaper than relying on Auth-Type Reject.
  if (user.status !== "active") {
    await deleteRadcheckRows(tx, user.username);
    return;
  }

  // Re-issue NT-Password from stored hash (already authoritative).
  if (user.secret) {
    await upsertRadcheck(tx, user.username, "NT-Password", user.secret.ntHash, ":=");
    await upsertRadcheck(tx, user.username, "Auth-Type", "EAP", ":=");
  }

  // Account validity (Expiration uses FreeRADIUS' date format).
  await tx.$executeRaw`DELETE FROM radcheck WHERE username = ${user.username} AND attribute = 'Expiration';`;
  if (user.validUntil) {
    const formatted = formatRadiusDate(user.validUntil);
    await upsertRadcheck(tx, user.username, "Expiration", formatted, ":=");
  }

  await syncUserGroupMapping(
    tx,
    user.username,
    user.groups.map((g) => g.group.name),
  );
}

/**
 * Group write-through. Replaces all radgroupcheck + radgroupreply rows
 * for the given group with the platform-side attribute list.
 */
export async function syncGroupToRadius(tx: Tx, groupId: string) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    include: { attributes: true },
  });
  if (!group) throw NotFound("Group not found");

  await tx.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${group.name};`;
  await tx.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${group.name};`;

  for (const attr of group.attributes) {
    if (attr.kind === "check") {
      await tx.$executeRaw`
        INSERT INTO radgroupcheck (groupname, attribute, op, value)
        VALUES (${group.name}, ${attr.attribute}, ${attr.op}, ${attr.value});
      `;
    } else {
      await tx.$executeRaw`
        INSERT INTO radgroupreply (groupname, attribute, op, value)
        VALUES (${group.name}, ${attr.attribute}, ${attr.op}, ${attr.value});
      `;
    }
  }
}

/**
 * Remove all RADIUS state for a user. Used on hard-delete + on
 * status transitions to 'suspended' / 'expired'.
 */
export async function purgeUserFromRadius(tx: Tx, username: string) {
  await deleteRadcheckRows(tx, username);
}

/**
 * Remove all RADIUS-side state for a group: its policy attributes
 * (radgroupcheck / radgroupreply) and every membership row pointing
 * at it (radusergroup). Called from the group-delete route — must be
 * the *only* code path that writes those tables outside the user-sync
 * helpers above.
 */
export async function purgeGroupFromRadius(tx: Tx, groupName: string) {
  await tx.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${groupName};`;
  await tx.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${groupName};`;
  await tx.$executeRaw`DELETE FROM radusergroup  WHERE groupname = ${groupName};`;
}

// FreeRADIUS expects: "31 Dec 2026 23:59:59"
function formatRadiusDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ── NAS sync ───────────────────────────────────────────────────────
//   FreeRADIUS reads the `nas` table at startup and (with the SQL
//   module's `read_clients = yes`) for clients lookups. Any change
//   the platform makes must be reflected there in the same tx as the
//   app-side NasClient row, then FreeRADIUS reloads (HUP signal) so
//   it picks up the new entries without dropping in-flight sessions.

export async function syncNasToRadius(tx: Tx, nasId: string) {
  const nas = await tx.nasClient.findUnique({ where: { id: nasId } });
  if (!nas) throw NotFound("NAS not found");

  // Identify the row by nasname (IP/CIDR) — that's the natural key
  // the upstream `nas` table indexes on.
  await tx.$executeRaw`DELETE FROM nas WHERE nasname = ${nas.nasname};`;

  if (!nas.enabled) return; // disabled → leave the row out

  await tx.$executeRaw`
    INSERT INTO nas (nasname, shortname, type, secret, description)
    VALUES (${nas.nasname}, ${nas.shortname}, ${nas.type}, ${nas.secret}, ${nas.description ?? ""});
  `;
}

export async function purgeNasFromRadius(tx: Tx, nasname: string) {
  await tx.$executeRaw`DELETE FROM nas WHERE nasname = ${nasname};`;
}
