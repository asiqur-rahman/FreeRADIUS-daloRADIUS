import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import { decode, encode, type RadiusPacket } from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import { decodeAllVsas, findVsa, VendorId, vendorAttribute } from "../src/protocol/vendor.js";

describe("Vendor-Specific Attribute codec", () => {
  it("encodes and decodes a single VSA", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: Buffer.alloc(16),
      attributes: [vendorAttribute(VendorId.Microsoft, 11, Buffer.from([1, 2, 3, 4]))],
    };
    const round = decode(encode(packet));
    const value = findVsa(round, VendorId.Microsoft, 11);
    assert.deepEqual(value, Buffer.from([1, 2, 3, 4]));
  });

  it("finds the right sub-attribute when multiple VSAs are present", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 2,
      authenticator: Buffer.alloc(16),
      attributes: [
        vendorAttribute(VendorId.Microsoft, 11, Buffer.alloc(16, 0xaa)),
        vendorAttribute(VendorId.Microsoft, 25, Buffer.alloc(50, 0xbb)),
      ],
    };
    const round = decode(encode(packet));
    const all = decodeAllVsas(round);
    assert.equal(all.length, 2);
    const challenge = findVsa(round, VendorId.Microsoft, 11);
    const response = findVsa(round, VendorId.Microsoft, 25);
    assert.ok(challenge);
    assert.ok(response);
    assert.equal(challenge.length, 16);
    assert.equal(response.length, 50);
    assert.equal(challenge[0], 0xaa);
    assert.equal(response[0], 0xbb);
  });

  it("returns undefined for absent VSAs", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 3,
      authenticator: Buffer.alloc(16),
      attributes: [],
    };
    assert.equal(findVsa(packet, VendorId.Microsoft, 11), undefined);
  });

  it("rejects oversized VSA values at encode time", () => {
    assert.throws(() => vendorAttribute(VendorId.Microsoft, 1, Buffer.alloc(300)));
  });
});
