// ─────────────────────────────────────────────────────────────────────
//  PEAP startup smoke test.
//
//  Validates the first half of a PEAP exchange:
//    1. With PEAP_ENABLED, the EAP dispatcher answers Identity with
//       EAP-Request/PEAP carrying S=1 (Start), no TLS data yet.
//    2. The State attribute is mintable + the EAP session is stored.
//
//  Full handshake-through-MSK testing requires a working supplicant TLS
//  client; that's exercised separately in peap-handshake.test.ts (best-
//  effort — Node's TLSSocket asynchrony interacts with our Duplex in
//  ways that make a hermetic round-trip flaky; we run it but tolerate
//  Node-version dependent skew).
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import {
  findAttribute,
  getConcatenated,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import { decodeEap, encodeEap, EapCode, EapType } from "../src/protocol/eap.js";
import { decodePeap } from "../src/protocol/peap.js";
import { handleAccessRequest } from "../src/auth/dispatch.js";
import { clearAllEapSessions } from "../src/eap/state.js";
import type { AuthBackend, AuthSubject } from "../src/auth/common.js";
import { setTlsMaterialForTesting } from "../src/tls-config.js";
import selfsigned from "selfsigned";

const NAS = {
  id: "nas-1",
  nasname: "10.0.0.1",
  shortname: "test-nas",
  secret: "secret-secret-32-aaaaaaaaaaaaaaaaa",
  type: "other",
  coaPort: 3799,
  enabled: true,
  siteId: null,
};

function fakeSubject(): AuthSubject {
  return {
    user: {
      id: "u1",
      username: "alice",
      email: "alice@x.test",
      fullName: null,
      role: "user",
      status: "active",
      validFrom: null,
      validUntil: null,
      mfaEnabled: false,
      mfaSecret: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    secret: {
      userId: "u1",
      passwordHashArgon2id: "x",
      ntHash: "0".repeat(32),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      failedAttempts: 0,
      lockedUntil: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

// Process env must be set BEFORE the config module is loaded the first
// time. We rely on test/.env doing that for non-PEAP envs; for this
// test we just toggle PEAP_ENABLED in-process before any config() call
// happens — but config() is cached, so it MUST not have been called yet.
process.env.PEAP_ENABLED = "true";

before(() => {
  // Inject a deterministic self-signed cert so we don't write to disk.
  const cert = selfsigned.generate([{ name: "commonName", value: "test" }], {
    days: 1,
    keySize: 2048,
    algorithm: "sha256",
  });
  setTlsMaterialForTesting({
    cert: Buffer.from(cert.cert, "utf8"),
    key: Buffer.from(cert.private, "utf8"),
    fromDisk: false,
  });
});

describe("PEAP first round", () => {
  it("answers EAP-Identity with EAP-Request/PEAP Start", async () => {
    clearAllEapSessions();
    const backend: AuthBackend = {
      loadSubject: async () => fakeSubject(),
      logPostAuth: async () => {},
    };

    const identity = encodeEap({
      code: EapCode.Response,
      identifier: 1,
      type: EapType.Identity,
      data: Buffer.from("alice", "utf8"),
    });
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: Buffer.alloc(16, 0x42),
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.EapMessage, value: identity },
      ],
    };

    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessChallenge);

    const stateAttr = findAttribute(reply, AttrType.State);
    assert.ok(stateAttr, "Access-Challenge must include State");
    assert.equal(stateAttr.value.length, 16);

    const eap = decodeEap(getConcatenated(reply, AttrType.EapMessage)!);
    assert.equal(eap.code, EapCode.Request);
    assert.equal(eap.type, EapType.Peap);

    const peap = decodePeap(eap.data);
    assert.equal(peap.start, true, "First PEAP fragment must have S=1");
    assert.equal(peap.tls.length, 0, "Start packet carries no TLS bytes");
    assert.equal(peap.moreFragments, false);
  });
});
