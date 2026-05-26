// ─────────────────────────────────────────────────────────────────────
//  Auth scaffolding shared by every method.
//
//  Encapsulates:
//   - User + secret lookup (with realm stripping)
//   - The "is this account currently allowed to authenticate" gate
//     (status === 'active' AND not expired)
//   - radpostauth post-auth logging — the operations dashboard reads
//     from this table for trends and reject reasons, so every Access-
//     Accept / Access-Reject the platform issues must land here.
// ─────────────────────────────────────────────────────────────────────

import type { User, UserSecret } from "@prisma/client";
import { prisma } from "../db.js";
import { log } from "../log.js";

export interface AuthSubject {
  user: User;
  secret: UserSecret;
}

/**
 * The DB-backed operations the dispatcher needs. Exposed as an
 * interface so tests can supply an in-memory implementation without
 * touching Postgres.
 */
export interface AuthBackend {
  loadSubject(rawUsername: string): Promise<AuthSubject | null>;
  logPostAuth(entry: PostAuthEntry): Promise<void>;
  /** Optional — used by EAP-TLS to verify a presented client cert
   *  against the user's registered device fingerprints. */
  findDeviceByFingerprint?(userId: string, fingerprint: string): Promise<boolean>;
}

/**
 * Normalise a User-Name attribute for lookup.
 *
 * Real-world clients send a mix of: `alice`, `alice@example.com`,
 * `DOMAIN\\alice`. We accept all three and resolve to the canonical
 * lowercase `username` column. The original (post-normalisation) form
 * is what we feed back to the MSCHAP ChallengeHash, however — see
 * mschapv2.ts for that subtlety.
 */
export function normaliseUsername(raw: string): string {
  let v = raw;
  // Down-level logon format: DOMAIN\user → user
  const slash = v.lastIndexOf("\\");
  if (slash !== -1) v = v.slice(slash + 1);
  // UPN: user@realm → user
  const at = v.indexOf("@");
  if (at !== -1) v = v.slice(0, at);
  return v.toLowerCase();
}

export async function loadSubject(rawUsername: string): Promise<AuthSubject | null> {
  const username = normaliseUsername(rawUsername);
  if (!username) return null;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { secret: true },
  });
  if (!user || !user.secret) return null;
  return { user, secret: user.secret };
}

export function isSubjectActive(subject: AuthSubject): boolean {
  if (subject.user.status !== "active") return false;
  if (subject.user.validFrom && subject.user.validFrom > new Date()) return false;
  if (subject.user.validUntil && subject.user.validUntil < new Date()) return false;
  return true;
}

// ── radpostauth ──────────────────────────────────────────────────────

export type RadiusReply = "Access-Accept" | "Access-Reject";

export interface PostAuthEntry {
  username: string; // raw value seen on the wire (for forensics)
  reply: RadiusReply;
  /** Free-text rejection reason (limited to 32 chars by the column). */
  class?: string | null;
  callingStationId?: string | null;
  calledStationId?: string | null;
}

/**
 * Insert a row into radpostauth. We never log the plaintext password
 * (the `pass` column is deliberately left null); operators looking
 * for "why was this rejected" rely on the `class` column.
 */
export async function logPostAuth(entry: PostAuthEntry): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO radpostauth (username, reply, calledstationid, callingstationid, class)
      VALUES (
        ${entry.username},
        ${entry.reply},
        ${entry.calledStationId ?? null},
        ${entry.callingStationId ?? null},
        ${entry.class ?? null}
      );
    `;
  } catch (err) {
    // Persistence failures must never break the auth path — log and move on.
    log.error({ err, username: entry.username }, "auth.postauth_insert_failed");
  }
}

async function findDeviceByFingerprint(userId: string, fingerprint: string): Promise<boolean> {
  const fp = fingerprint.toLowerCase();
  const device = await prisma.userDevice.findFirst({
    where: { userId, certFingerprint: fp },
    select: { id: true },
  });
  return device !== null;
}

/** Default Postgres-backed backend used by the bootstrap entrypoint. */
export const prismaAuthBackend: AuthBackend = {
  loadSubject,
  logPostAuth,
  findDeviceByFingerprint,
};
