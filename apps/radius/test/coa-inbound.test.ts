// ─────────────────────────────────────────────────────────────────────
//  Inbound CoA / Disconnect handler.
//
//  Confirms RFC 5176 §3.5 NAK behaviour: we politely refuse rather
//  than silently dropping, with an Error-Cause attribute attached.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import {
  findAttribute,
  octetsAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import { handleCoaRequest, handleDisconnectRequest } from "../src/coa/inbound.js";

const ATTR_ERROR_CAUSE = 101;

function readErrorCause(packet: RadiusPacket): number | null {
  const a = findAttribute(packet, ATTR_ERROR_CAUSE);
  if (!a || a.value.length !== 4) return null;
  return a.value.readUInt32BE(0);
}

describe("inbound Disconnect-Request", () => {
  it("returns Disconnect-NAK with Error-Cause 503 (Session Context Not Found)", () => {
    const request: RadiusPacket = {
      code: RadiusCode.DisconnectRequest,
      identifier: 5,
      authenticator: Buffer.alloc(16),
      attributes: [],
    };
    const reply = handleDisconnectRequest(request);
    assert.equal(reply.code, RadiusCode.DisconnectNak);
    assert.equal(reply.identifier, 5);
    assert.equal(readErrorCause(reply), 503);
  });

  it("echoes Proxy-State unchanged", () => {
    const proxyValue = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const request: RadiusPacket = {
      code: RadiusCode.DisconnectRequest,
      identifier: 6,
      authenticator: Buffer.alloc(16),
      attributes: [octetsAttribute(AttrType.ProxyState, proxyValue)],
    };
    const reply = handleDisconnectRequest(request);
    const echoed = findAttribute(reply, AttrType.ProxyState);
    assert.ok(echoed);
    assert.deepEqual(echoed.value, proxyValue);
  });
});

describe("inbound CoA-Request", () => {
  it("returns CoA-NAK with Error-Cause 501 (Administratively Prohibited)", () => {
    const request: RadiusPacket = {
      code: RadiusCode.CoaRequest,
      identifier: 7,
      authenticator: Buffer.alloc(16),
      attributes: [],
    };
    const reply = handleCoaRequest(request);
    assert.equal(reply.code, RadiusCode.CoaNak);
    assert.equal(readErrorCause(reply), 501);
  });
});
