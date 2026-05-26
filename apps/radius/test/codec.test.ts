// Round-trip + defensive-decode tests for the RADIUS codec.
// Run via `pnpm --filter @app/radius test` (uses Node's built-in
// test runner + tsx loader).
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import {
  decode,
  encode,
  findAllAttributes,
  findAttribute,
  getIpv4,
  getInteger,
  getString,
  integerAttribute,
  ipv4Attribute,
  stringAttribute,
  RADIUS_HEADER_LENGTH,
  type RadiusPacket,
  RadiusDecodeError,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";

function makePacket(): RadiusPacket {
  return {
    code: RadiusCode.AccessRequest,
    identifier: 17,
    authenticator: Buffer.alloc(16, 0xaa),
    attributes: [
      stringAttribute(AttrType.UserName, "alice@example.test"),
      integerAttribute(AttrType.NasPort, 1812),
      ipv4Attribute(AttrType.NasIpAddress, "10.0.0.5"),
      stringAttribute(AttrType.CallingStationId, "AA-BB-CC-DD-EE-FF"),
    ],
  };
}

describe("codec round-trip", () => {
  it("encodes then decodes to the same logical packet", () => {
    const original = makePacket();
    const wire = encode(original);
    const decoded = decode(wire);

    assert.equal(decoded.code, original.code);
    assert.equal(decoded.identifier, original.identifier);
    assert.deepEqual(decoded.authenticator, original.authenticator);
    assert.equal(decoded.attributes.length, original.attributes.length);

    assert.equal(getString(decoded, AttrType.UserName), "alice@example.test");
    assert.equal(getInteger(decoded, AttrType.NasPort), 1812);
    assert.equal(getIpv4(decoded, AttrType.NasIpAddress), "10.0.0.5");
    assert.equal(getString(decoded, AttrType.CallingStationId), "AA-BB-CC-DD-EE-FF");
  });

  it("encoded length matches header Length field", () => {
    const wire = encode(makePacket());
    assert.equal(wire.readUInt16BE(2), wire.length);
  });

  it("preserves the order of repeating attributes (EAP-Message fragments)", () => {
    const original: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: Buffer.alloc(16),
      attributes: [
        { type: AttrType.EapMessage, value: Buffer.from([0x01, 0x02, 0x03]) },
        { type: AttrType.EapMessage, value: Buffer.from([0x04, 0x05]) },
        { type: AttrType.EapMessage, value: Buffer.from([0x06]) },
      ],
    };
    const decoded = decode(encode(original));
    const fragments = findAllAttributes(decoded, AttrType.EapMessage);
    assert.deepEqual(fragments.map((f) => Array.from(f.value)), [
      [0x01, 0x02, 0x03],
      [0x04, 0x05],
      [0x06],
    ]);
  });
});

describe("codec defensive decode", () => {
  it("rejects packets shorter than the 20-byte header", () => {
    assert.throws(() => decode(Buffer.alloc(19)), RadiusDecodeError);
  });

  it("rejects packets whose stated length exceeds the buffer", () => {
    const wire = encode(makePacket());
    wire.writeUInt16BE(wire.length + 4, 2);
    assert.throws(() => decode(wire), RadiusDecodeError);
  });

  it("rejects attribute lengths below the 2-byte minimum", () => {
    const broken = Buffer.concat([encode(makePacket()), Buffer.from([0x99, 0x00])]);
    // bump stated length so we walk into the broken attribute
    broken.writeUInt16BE(broken.length, 2);
    assert.throws(() => decode(broken), RadiusDecodeError);
  });

  it("rejects attribute lengths that overrun the packet end", () => {
    // Hand-craft: header + truncated attribute claiming length 50.
    const header = Buffer.alloc(RADIUS_HEADER_LENGTH);
    header.writeUInt8(RadiusCode.AccessRequest, 0);
    header.writeUInt16BE(RADIUS_HEADER_LENGTH + 3, 2);
    const truncated = Buffer.concat([header, Buffer.from([1, 50, 0x41])]);
    assert.throws(() => decode(truncated), RadiusDecodeError);
  });

  it("findAttribute returns undefined for missing attributes", () => {
    const packet = decode(encode(makePacket()));
    assert.equal(findAttribute(packet, 99), undefined);
    assert.equal(getString(packet, 99), undefined);
  });
});
