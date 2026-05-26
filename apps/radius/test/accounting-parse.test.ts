import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import {
  integerAttribute,
  ipv4Attribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import { AcctStatusType, parseAccountingRequest } from "../src/accounting/parse.js";

function basePacket(extra: RadiusPacket["attributes"]): RadiusPacket {
  return {
    code: RadiusCode.AccountingRequest,
    identifier: 1,
    authenticator: Buffer.alloc(16),
    attributes: [
      stringAttribute(AttrType.UserName, "alice"),
      stringAttribute(AttrType.AcctSessionId, "sess-1234"),
      ipv4Attribute(AttrType.NasIpAddress, "10.0.0.1"),
      integerAttribute(AttrType.NasPort, 7),
      ...extra,
    ],
  };
}

describe("parseAccountingRequest", () => {
  it("captures the core identity + session fields", () => {
    const packet = basePacket([integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start)]);
    const parsed = parseAccountingRequest(packet, "192.0.2.50");

    assert.equal(parsed.statusType, AcctStatusType.Start);
    assert.equal(parsed.username, "alice");
    assert.equal(parsed.sessionId, "sess-1234");
    assert.equal(parsed.nasIpAddress, "10.0.0.1");
    assert.equal(parsed.nasPort, 7);
    assert.equal(parsed.inputOctets, 0n);
    assert.equal(parsed.outputOctets, 0n);
  });

  it("falls back to the peer source IP when NAS-IP-Address is absent", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccountingRequest,
      identifier: 2,
      authenticator: Buffer.alloc(16),
      attributes: [
        stringAttribute(AttrType.UserName, "bob"),
        stringAttribute(AttrType.AcctSessionId, "s-1"),
        integerAttribute(AttrType.AcctStatusType, AcctStatusType.Stop),
      ],
    };
    const parsed = parseAccountingRequest(packet, "192.0.2.99");
    assert.equal(parsed.nasIpAddress, "192.0.2.99");
  });

  it("combines Acct-Input-Gigawords + Acct-Input-Octets into a BigInt", () => {
    // 5 GB session → 1 gigaword (=2^32 bytes) + 5*1024*1024*1024 - 2^32 octets.
    const gigawords = 1;
    const octets = 1_073_741_824; // 1 GiB; total = 1 GiB + 4 GiB = 5 GiB
    const packet = basePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.Stop),
      integerAttribute(AttrType.AcctInputGigawords, gigawords),
      integerAttribute(AttrType.AcctInputOctets, octets),
      integerAttribute(AttrType.AcctOutputGigawords, 0),
      integerAttribute(AttrType.AcctOutputOctets, 2048),
    ]);
    const parsed = parseAccountingRequest(packet, "10.0.0.1");
    // 1 << 32 + 1 GiB = 5 GiB total
    assert.equal(parsed.inputOctets, (1n << 32n) + 1_073_741_824n);
    assert.equal(parsed.outputOctets, 2048n);
  });

  it("maps terminate-cause numbers to FreeRADIUS dictionary labels", () => {
    const packet = basePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.Stop),
      integerAttribute(AttrType.AcctTerminateCause, 4), // Idle-Timeout
      integerAttribute(AttrType.AcctAuthentic, 1),      // RADIUS
    ]);
    const parsed = parseAccountingRequest(packet, "10.0.0.1");
    assert.equal(parsed.terminateCause, "Idle-Timeout");
    assert.equal(parsed.acctAuthentic, "RADIUS");
  });

  it("leaves terminate cause empty when not provided", () => {
    const packet = basePacket([integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start)]);
    const parsed = parseAccountingRequest(packet, "10.0.0.1");
    assert.equal(parsed.terminateCause, "");
  });
});
