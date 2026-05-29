// ──────────────────────────────────────────────────────────────────────────────
//  Symmetric encryption utility — AES-256-GCM.
//
//  Used wherever sensitive short strings must be stored in the database
//  encrypted at rest (PKCS12 passwords, etc.).
//
//  The encryption key is derived from MFA_ENCRYPTION_KEY via SHA-256.
//  This matches the pattern used in totp.ts for TOTP secrets.
//
//  Format: "v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>"
// ──────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

function deriveKey(rawKey: string): Buffer {
  return createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a versioned `v1.<iv>.<tag>.<ciphertext>` token (all base64url).
 * Uses MFA_ENCRYPTION_KEY from config by default.
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey(config().MFA_ENCRYPTION_KEY);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a value produced by `encrypt()`.
 * If the stored value is not in v1 format (e.g. legacy plaintext), returns it as-is.
 */
export function decrypt(stored: string): string {
  if (!stored.startsWith("v1.")) return stored;
  const parts = stored.split(".");
  const [, ivValue, tagValue, cipherValue] = parts;
  if (!ivValue || !tagValue || !cipherValue) throw new Error("Invalid encrypted value format");
  const key = deriveKey(config().MFA_ENCRYPTION_KEY);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
