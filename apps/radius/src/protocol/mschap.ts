// ─────────────────────────────────────────────────────────────────────
//  MSCHAPv2 primitives (RFC 2759).
//
//  We only implement the server-side verification half: given the
//  NAS-supplied Auth-Challenge, the client-supplied Peer-Challenge
//  and NT-Response, plus the stored NT-hash, recompute the expected
//  NT-Response and compare. On success, generate the AuthenticatorResponse
//  string that the client uses to verify the server.
//
//  Legacy crypto warning: this code uses MD4 and single-DES (via
//  Node's OpenSSL legacy provider). Node 20+ binaries bundle that
//  provider, but if you ever see "unsupported" errors at runtime, set
//  OPENSSL_CONF / load the legacy provider explicitly.
// ─────────────────────────────────────────────────────────────────────

import { createCipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Re-export commonly needed constants/values to keep imports flat at callsites.
export const MicrosoftVsa = {
  // RFC 2548 (Microsoft Vendor-Specific RADIUS attributes)
  MsChapResponse: 1,
  MsChapError: 2,
  MsChapChallenge: 11,
  MsMppeSendKey: 16,
  MsMppeRecvKey: 17,
  MsChap2Response: 25,
  MsChap2Success: 26,
} as const;

// MS-CHAP2-Response on the wire (50 bytes total, RFC 2759 §3):
//   Ident(1) | Flags(1) | Peer-Challenge(16) | Reserved(8) | NT-Response(24)
export interface MsChap2Response {
  ident: number;
  flags: number;
  peerChallenge: Buffer; // 16 bytes
  ntResponse: Buffer;    // 24 bytes
}

export function parseMsChap2Response(value: Buffer): MsChap2Response {
  if (value.length !== 50) {
    throw new Error(`MS-CHAP2-Response must be 50 bytes (got ${value.length})`);
  }
  return {
    ident: value.readUInt8(0),
    flags: value.readUInt8(1),
    peerChallenge: Buffer.from(value.subarray(2, 18)),
    // 8 bytes reserved (18..26) — must be zero per spec but we don't enforce
    ntResponse: Buffer.from(value.subarray(26, 50)),
  };
}

// ── Building blocks ───────────────────────────────────────────────

/** NT-hash of a UTF-16LE password (MD4). Matches our stored ntHash. */
export function nthashOfPassword(password: string): Buffer {
  const utf16le = Buffer.from(password, "utf16le");
  return createHash("md4").update(utf16le).digest();
}

/** ChallengeHash (RFC 2759 §5): SHA-1(Peer-Challenge||Auth-Challenge||UserName)[0..8] */
export function challengeHash(
  peerChallenge: Buffer,
  authChallenge: Buffer,
  username: string,
): Buffer {
  if (peerChallenge.length !== 16 || authChallenge.length !== 16) {
    throw new Error("ChallengeHash requires 16-byte challenges");
  }
  return createHash("sha1")
    .update(peerChallenge)
    .update(authChallenge)
    .update(Buffer.from(username, "utf8"))
    .digest()
    .subarray(0, 8);
}

/**
 * Expand a 7-byte block into a parity-padded 8-byte DES key
 * (RFC 2759 §6 — DesEncrypt subroutine). The DES parity bits go in
 * the LSB of each output byte; OpenSSL/Node ignore them, but we set
 * them to keep wire-compatible with reference implementations.
 */
function expand7ByteToDesKey(key7: Buffer): Buffer {
  if (key7.length !== 7) throw new Error("DES key expansion expects 7 bytes");
  const k = Buffer.alloc(8);
  k[0] = (key7[0]! >> 1) & 0x7f;
  k[1] = ((key7[0]! & 0x01) << 6) | ((key7[1]! >> 2) & 0x3f);
  k[2] = ((key7[1]! & 0x03) << 5) | ((key7[2]! >> 3) & 0x1f);
  k[3] = ((key7[2]! & 0x07) << 4) | ((key7[3]! >> 4) & 0x0f);
  k[4] = ((key7[3]! & 0x0f) << 3) | ((key7[4]! >> 5) & 0x07);
  k[5] = ((key7[4]! & 0x1f) << 2) | ((key7[5]! >> 6) & 0x03);
  k[6] = ((key7[5]! & 0x3f) << 1) | ((key7[6]! >> 7) & 0x01);
  k[7] = key7[6]! & 0x7f;

  // Each output byte currently has 7 data bits in the high bits; shift
  // left one to leave room for the parity bit (LSB). DES ignores the
  // parity bit so we leave it zero.
  for (let i = 0; i < 8; i++) k[i] = (k[i]! << 1) & 0xff;
  return k;
}

function desEncryptBlock(key7: Buffer, plaintext: Buffer): Buffer {
  if (plaintext.length !== 8) throw new Error("DES block must be 8 bytes");
  const desKey = expand7ByteToDesKey(key7);
  // ECB with explicit null IV, no padding — single block in/out.
  const cipher = createCipheriv("des-ecb", desKey, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

/**
 * Compute NT-Response (24 bytes) given the stored NT-hash and an
 * 8-byte ChallengeHash. RFC 2759 §6 / §7.
 */
export function computeNtResponse(ntHash: Buffer, chHash: Buffer): Buffer {
  if (ntHash.length !== 16) throw new Error("NT-Hash must be 16 bytes");
  if (chHash.length !== 8) throw new Error("ChallengeHash must be 8 bytes");
  // Zero-pad NT-hash out to 21 bytes for the three 7-byte DES key slices.
  const zHash = Buffer.alloc(21);
  ntHash.copy(zHash);
  const r1 = desEncryptBlock(zHash.subarray(0, 7), chHash);
  const r2 = desEncryptBlock(zHash.subarray(7, 14), chHash);
  const r3 = desEncryptBlock(zHash.subarray(14, 21), chHash);
  return Buffer.concat([r1, r2, r3]);
}

// ── Server's authenticator response (S=... string) ─────────────────

// RFC 2759 §8 — magic constants.
const MAGIC_SERVER_1 = Buffer.from(
  "Magic server to client signing constant",
  "ascii",
);
const MAGIC_SERVER_2 = Buffer.from(
  "Pad to make it do more than one iteration",
  "ascii",
);

/**
 * GenerateAuthenticatorResponse (RFC 2759 §8).
 * Returns the 20-byte SHA-1 digest; caller formats as uppercase hex.
 */
export function generateAuthenticatorResponse(
  ntHash: Buffer,
  ntResponse: Buffer,
  peerChallenge: Buffer,
  authChallenge: Buffer,
  username: string,
): Buffer {
  const passwordHashHash = createHash("md4").update(ntHash).digest();
  const digest = createHash("sha1")
    .update(passwordHashHash)
    .update(ntResponse)
    .update(MAGIC_SERVER_1)
    .digest();
  const chHash = challengeHash(peerChallenge, authChallenge, username);
  return createHash("sha1")
    .update(digest)
    .update(chHash)
    .update(MAGIC_SERVER_2)
    .digest();
}

/**
 * Format the MS-CHAP2-Success VSA value: "<ident-byte>S=<40-hex> M=Welcome".
 * The leading byte is the Ident copied from MS-CHAP2-Response so the
 * peer matches the success to its request.
 */
export function formatChap2Success(ident: number, authenticatorResponse: Buffer): Buffer {
  const hex = authenticatorResponse.toString("hex").toUpperCase();
  const body = Buffer.from(`S=${hex} M=Authentication succeeded`, "ascii");
  return Buffer.concat([Buffer.from([ident & 0xff]), body]);
}

/** Verify a received NT-Response in constant time. */
export function verifyNtResponse(expected: Buffer, received: Buffer): boolean {
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

// Random Auth-Challenge generator (mainly for tests + future PEAP-inner use).
export function randomChallenge(): Buffer {
  return randomBytes(16);
}
