// ─────────────────────────────────────────────────────────────────────
//  Password primitives.
//
//  hashPassword / verifyPassword → Argon2id for web auth (at rest).
//  ntHash                         → NT-hash for radcheck (RADIUS sync).
//
//  Per the architecture doc both must be updated atomically on every
//  password change — see RadiusPolicyService.changeUserPassword.
// ─────────────────────────────────────────────────────────────────────
import argon2 from "argon2";
import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import { config } from "../config.js";

export async function hashPassword(plaintext: string): Promise<string> {
  const c = config();
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: c.ARGON2_MEMORY,
    timeCost: c.ARGON2_TIME,
    parallelism: c.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/**
 * NT-hash = MD4(UTF-16LE(password)), hex uppercase.
 * MD4 is legacy in OpenSSL 3 — Node still exposes it via the openssl
 * legacy provider, which the official node:20+ images bundle. If that
 * ever changes, swap to a userland MD4 (e.g. js-md4).
 */
export function ntHash(plaintext: string): string {
  const utf16le = iconv.encode(plaintext, "utf16-le");
  return createHash("md4").update(utf16le).digest("hex").toUpperCase();
}
