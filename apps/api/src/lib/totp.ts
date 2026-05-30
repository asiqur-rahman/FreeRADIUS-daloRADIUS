import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function base32Decode(secret: string): Buffer {
  let bits = "";
  for (const char of secret.replace(/=+$/g, "").toUpperCase()) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(config().MFA_ENCRYPTION_KEY).digest();
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptTotpSecret(stored: string): string {
  if (!stored.startsWith("v1.")) return stored;
  const [, ivValue, tagValue, cipherValue] = stored.split(".");
  if (!ivValue || !tagValue || !cipherValue) throw new Error("Invalid encrypted TOTP secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherValue, "base64url")), decipher.final()]).toString("utf8");
}

function codeAt(secret: string, counter: number): string {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(input).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, "0");
}

export function createTotpEnrollment(username: string) {
  const secret = base32Encode(randomBytes(20));
  return {
    secret,
    encryptedSecret: encryptTotpSecret(secret),
    otpauthUri: `otpauth://totp/RadiusOps:${encodeURIComponent(username)}?secret=${secret}&issuer=RadiusOps&algorithm=SHA1&digits=6&period=30`,
  };
}

export function verifyTotp(storedSecret: string, code: string, at = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = decryptTotpSecret(storedSecret);
  const counter = Math.floor(at / 30_000);
  return [-1, 0, 1].some((window) => {
    const expected = Buffer.from(codeAt(secret, counter + window));
    return timingSafeEqual(expected, Buffer.from(code));
  });
}
