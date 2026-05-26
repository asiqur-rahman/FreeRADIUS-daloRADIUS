// ─────────────────────────────────────────────────────────────────────
//  RFC 2548 §2.4 salted MPPE key encryption.
//
//  We can't pin to a published spec vector (RFC 2548 doesn't include
//  one), but we *can* verify structure + round-trip via the same XOR
//  stream the encoder uses.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createHash, randomBytes } from "node:crypto";

import { AttrType } from "../src/protocol/attributes.js";
import { decodeAllVsas, VendorId } from "../src/protocol/vendor.js";
import { MicrosoftVsa } from "../src/protocol/mschap.js";
import { mppeRecvKey, mppeSendKey } from "../src/eap/methods/mppe.js";

const SECRET = "shared-secret-for-test";

function decryptMppe(value: Buffer, secret: string, requestAuthenticator: Buffer): Buffer {
  const salt = value.subarray(0, 2);
  const cipher = value.subarray(2);
  assert.equal(cipher.length % 16, 0, "ciphertext must be 16-byte aligned");
  const out = Buffer.alloc(cipher.length);
  let prev = Buffer.concat([requestAuthenticator, salt]);
  for (let off = 0; off < cipher.length; off += 16) {
    const b = createHash("md5").update(secret).update(prev).digest();
    for (let i = 0; i < 16; i++) out[off + i] = b[i]! ^ cipher[off + i]!;
    prev = cipher.subarray(off, off + 16);
  }
  // First byte is the original key length.
  const keyLen = out[0]!;
  return Buffer.from(out.subarray(1, 1 + keyLen));
}

describe("MS-MPPE key encryption", () => {
  it("Recv-Key round-trips a 32-byte MSK half", () => {
    const reqAuth = randomBytes(16);
    const mskHalf = randomBytes(32);
    const attr = mppeRecvKey(mskHalf, SECRET, reqAuth);
    assert.equal(attr.type, AttrType.VendorSpecific);

    // Decode VSA wrapper and check vendor-type matches.
    const vsas = decodeAllVsas({
      code: 2,
      identifier: 0,
      authenticator: Buffer.alloc(16),
      attributes: [attr],
    });
    assert.equal(vsas.length, 1);
    assert.equal(vsas[0]?.vendorId, VendorId.Microsoft);
    assert.equal(vsas[0]?.vendorType, MicrosoftVsa.MsMppeRecvKey);

    const decrypted = decryptMppe(vsas[0]!.value, SECRET, reqAuth);
    assert.deepEqual(decrypted, mskHalf);
  });

  it("Send-Key carries the second 32 bytes of MSK", () => {
    const reqAuth = randomBytes(16);
    const mskHalf = randomBytes(32);
    const attr = mppeSendKey(mskHalf, SECRET, reqAuth);
    const vsas = decodeAllVsas({
      code: 2,
      identifier: 0,
      authenticator: Buffer.alloc(16),
      attributes: [attr],
    });
    assert.equal(vsas[0]?.vendorType, MicrosoftVsa.MsMppeSendKey);
    const decrypted = decryptMppe(vsas[0]!.value, SECRET, reqAuth);
    assert.deepEqual(decrypted, mskHalf);
  });

  it("Salt has the high bit set (RFC 2548 §2.4.2)", () => {
    const reqAuth = randomBytes(16);
    const attr = mppeRecvKey(randomBytes(32), SECRET, reqAuth);
    const vsas = decodeAllVsas({
      code: 2,
      identifier: 0,
      authenticator: Buffer.alloc(16),
      attributes: [attr],
    });
    const salt = vsas[0]!.value.subarray(0, 2);
    assert.equal((salt[0]! & 0x80), 0x80, "salt[0] high bit must be 1");
  });
});
