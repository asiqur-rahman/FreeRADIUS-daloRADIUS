// ─────────────────────────────────────────────────────────────────────
//  PAP — User-Password attribute encoding (RFC 2865 §5.2).
//
//  The cipher is a simple XOR stream keyed by the shared secret and
//  the Request Authenticator. NOT a strong primitive; PAP is fine for
//  point-to-point use behind a trusted shared secret, weak elsewhere.
//
//      b1 = MD5(Secret || RequestAuthenticator)
//      p1 = c1 XOR b1
//      b2 = MD5(Secret || c1)
//      p2 = c2 XOR b2
//      ...
//
//  Plaintext is padded to a multiple of 16 with NUL bytes; trailing
//  NULs are stripped on decode. Max plaintext length: 128 bytes.
// ─────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

const BLOCK = 16;
const MAX_LENGTH = 128;

function xorBlock(dst: Buffer, offset: number, a: Buffer, b: Buffer): void {
  for (let i = 0; i < BLOCK; i++) {
    dst[offset + i] = a[i]! ^ b[i]!;
  }
}

export function encryptUserPassword(
  plaintext: string,
  secret: string,
  requestAuthenticator: Buffer,
): Buffer {
  const raw = Buffer.from(plaintext, "utf8");
  if (raw.length > MAX_LENGTH) {
    throw new Error(`PAP password too long (${raw.length} > ${MAX_LENGTH} bytes)`);
  }
  // Pad to a whole number of 16-byte blocks (minimum one block).
  const padded = Buffer.alloc(Math.max(BLOCK, Math.ceil(raw.length / BLOCK) * BLOCK));
  raw.copy(padded);

  const out = Buffer.alloc(padded.length);
  let prev = requestAuthenticator;
  for (let offset = 0; offset < padded.length; offset += BLOCK) {
    const b = createHash("md5").update(secret).update(prev).digest();
    xorBlock(out, offset, padded.subarray(offset, offset + BLOCK), b);
    prev = out.subarray(offset, offset + BLOCK);
  }
  return out;
}

export function decryptUserPassword(
  cipher: Buffer,
  secret: string,
  requestAuthenticator: Buffer,
): string {
  if (cipher.length === 0 || cipher.length % BLOCK !== 0 || cipher.length > MAX_LENGTH) {
    throw new Error(`PAP ciphertext has invalid length ${cipher.length}`);
  }
  const out = Buffer.alloc(cipher.length);
  let prev = requestAuthenticator;
  for (let offset = 0; offset < cipher.length; offset += BLOCK) {
    const b = createHash("md5").update(secret).update(prev).digest();
    xorBlock(out, offset, cipher.subarray(offset, offset + BLOCK), b);
    prev = cipher.subarray(offset, offset + BLOCK);
  }
  // Strip trailing NUL padding.
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.subarray(0, end).toString("utf8");
}
