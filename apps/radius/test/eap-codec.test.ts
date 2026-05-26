import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  chunkForEapMessage,
  decodeEap,
  EapCode,
  EapType,
  EapDecodeError,
  encodeEap,
} from "../src/protocol/eap.js";

describe("EAP codec", () => {
  it("round-trips an EAP-Response/Identity", () => {
    const eap = {
      code: EapCode.Response,
      identifier: 1,
      type: EapType.Identity,
      data: Buffer.from("alice", "utf8"),
    };
    const round = decodeEap(encodeEap(eap));
    assert.equal(round.code, EapCode.Response);
    assert.equal(round.identifier, 1);
    assert.equal(round.type, EapType.Identity);
    assert.equal(round.data.toString("utf8"), "alice");
  });

  it("encodes Success / Failure with length 4 and no Type byte", () => {
    const wire = encodeEap({ code: EapCode.Success, identifier: 7, data: Buffer.alloc(0) });
    assert.equal(wire.length, 4);
    assert.equal(wire.readUInt16BE(2), 4);
    assert.equal(decodeEap(wire).code, EapCode.Success);
    assert.equal(decodeEap(wire).type, undefined);
  });

  it("rejects truncated packets", () => {
    assert.throws(() => decodeEap(Buffer.alloc(3)), EapDecodeError);
    assert.throws(() => decodeEap(Buffer.from([1, 2, 0, 100])), EapDecodeError);
  });

  it("chunkForEapMessage splits >253-byte payloads into ≤253-byte chunks", () => {
    const big = Buffer.alloc(700);
    const chunks = chunkForEapMessage(big);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]?.length, 253);
    assert.equal(chunks[1]?.length, 253);
    assert.equal(chunks[2]?.length, 194);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    assert.equal(total, big.length);
  });
});
