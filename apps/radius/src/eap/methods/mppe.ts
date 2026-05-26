// ─────────────────────────────────────────────────────────────────────
//  MS-MPPE-Send-Key / MS-MPPE-Recv-Key encoding (RFC 2548 §2.4).
//
//  These VSAs carry the WPA2-Enterprise PMK halves from the RADIUS
//  server to the AP. Without them the AP cannot complete the 4-way
//  handshake — even with a valid Access-Accept, the client never
//  associates.
//
//  Wire format inside the VSA value:
//    Salt(2 bytes, high bit MUST be 1) || Encrypted-Key-Field
//
//  Encryption is the same XOR-MD5 stream PAP uses, but salted:
//    P  = [ Key-Length(1) | Key | padding-to-16 ]
//    b1 = MD5(Secret || RequestAuthenticator || Salt)
//    c1 = b1 XOR P[0..16]
//    b2 = MD5(Secret || c1)
//    c2 = b2 XOR P[16..32]
//    …
//
//  Two MS-MPPE keys per session: Send-Key (vendor-type 16) carries
//  the second 32 bytes of the MSK, Recv-Key (vendor-type 17) carries
//  the first 32 bytes. The "Send" / "Recv" naming is from the AP's
//  perspective.
// ─────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "node:crypto";
import { type RadiusAttribute } from "../../protocol/codec.js";
import { MicrosoftVsa } from "../../protocol/mschap.js";
import { VendorId, vendorAttribute } from "../../protocol/vendor.js";

function encryptKey(key: Buffer, secret: string, requestAuthenticator: Buffer): Buffer {
  // Salt: 2 bytes, top bit set, rest random.
  const salt = randomBytes(2);
  salt[0]! |= 0x80;

  // Plaintext: length-prefix + key, padded to a 16-byte multiple.
  const minLen = 1 + key.length;
  const padded = Buffer.alloc(Math.ceil(minLen / 16) * 16);
  padded[0] = key.length;
  key.copy(padded, 1);

  // XOR-MD5 chain.
  const out = Buffer.alloc(padded.length);
  let prev = Buffer.concat([requestAuthenticator, salt]);
  for (let off = 0; off < padded.length; off += 16) {
    const b = createHash("md5").update(secret).update(prev).digest();
    for (let i = 0; i < 16; i++) out[off + i] = b[i]! ^ padded[off + i]!;
    prev = out.subarray(off, off + 16);
  }
  return Buffer.concat([salt, out]);
}

export function mppeRecvKey(
  mskFirst32: Buffer,
  secret: string,
  requestAuthenticator: Buffer,
): RadiusAttribute {
  return vendorAttribute(
    VendorId.Microsoft,
    MicrosoftVsa.MsMppeRecvKey,
    encryptKey(mskFirst32, secret, requestAuthenticator),
  );
}

export function mppeSendKey(
  mskSecond32: Buffer,
  secret: string,
  requestAuthenticator: Buffer,
): RadiusAttribute {
  return vendorAttribute(
    VendorId.Microsoft,
    MicrosoftVsa.MsMppeSendKey,
    encryptKey(mskSecond32, secret, requestAuthenticator),
  );
}
