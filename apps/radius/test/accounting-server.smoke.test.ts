// ─────────────────────────────────────────────────────────────────────
//  End-to-end smoke test for the UDP-1813 accounting socket.
//
//  Sends a real Acct-Start over the wire with a computed Request
//  Authenticator and asserts:
//    - the server replies Accounting-Response
//    - the Response Authenticator verifies under the shared secret
//    - the in-memory AcctBackend received the parsed upsert
//    - the auth socket refuses an Accounting-Request (role guard)
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { createSocket } from "node:dgram";
import { describe, it, before, after } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import { AttrType } from "../src/protocol/attributes.js";
import {
  decode,
  encode,
  integerAttribute,
  ipv4Attribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  computeRequestAuthenticator,
  verifyResponseAuthenticator,
} from "../src/protocol/authenticators.js";
import { AcctStatusType, type AccountingRequest } from "../src/accounting/parse.js";
import type { AcctBackend } from "../src/accounting/persistence.js";

const SECRET = "smoke-test-secret-very-secret";
const AUTH_PORT = 31812;
const ACCT_PORT = 31813;

process.env.DATABASE_URL ??= "postgresql://x:y@localhost:5432/x";
process.env.RADIUS_AUTH_PORT = String(AUTH_PORT);
process.env.RADIUS_ACCT_PORT = String(ACCT_PORT);
process.env.RADIUS_COA_PORT = "31814";
process.env.RADIUS_HOST = "127.0.0.1";
process.env.LOG_LEVEL = "error";

const upserts: AccountingRequest[] = [];
const acctBackend: AcctBackend = {
  upsertSession: async (req) => {
    upserts.push(req);
  },
  closeNasSessions: async () => 0,
};

const { createRadiusServer } = await import("../src/server.js");

const server = createRadiusServer({
  lookupNas: async () => ({
    id: "nas-test",
    nasname: "127.0.0.1",
    shortname: "test-nas",
    secret: SECRET,
    type: "other",
    coaPort: 3799,
    enabled: true,
    siteId: null,
  }),
  authBackend: {
    loadSubject: async () => null,
    logPostAuth: async () => {},
  },
  acctBackend,
});

before(async () => {
  await server.listen();
});

after(async () => {
  await server.close();
});

function buildAcctStart(): { wire: Buffer; reqAuth: Buffer; identifier: number } {
  const identifier = 0x55;
  // Build with placeholder zero Authenticator, then compute Request
  // Authenticator from the encoded packet (RFC 2866 §3).
  const draft: RadiusPacket = {
    code: RadiusCode.AccountingRequest,
    identifier,
    authenticator: Buffer.alloc(16),
    attributes: [
      stringAttribute(AttrType.UserName, "alice"),
      stringAttribute(AttrType.AcctSessionId, "sess-smoke-1"),
      ipv4Attribute(AttrType.NasIpAddress, "127.0.0.1"),
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start),
    ],
  };
  const reqAuth = computeRequestAuthenticator(draft, SECRET);
  return { wire: encode({ ...draft, authenticator: reqAuth }), reqAuth, identifier };
}

describe("accounting socket (UDP 1813)", () => {
  it("acks Acct-Start with a verifying Response Authenticator and persists", async () => {
    const client = createSocket("udp4");
    try {
      upserts.length = 0;
      const { wire, reqAuth, identifier } = buildAcctStart();

      const replyPromise = new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no reply in 2s")), 2000);
        client.once("message", (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      client.send(wire, ACCT_PORT, "127.0.0.1");
      const reply = await replyPromise;
      const decoded = decode(reply);

      assert.equal(decoded.code, RadiusCode.AccountingResponse);
      assert.equal(decoded.identifier, identifier);
      assert.equal(verifyResponseAuthenticator(reply, reqAuth, SECRET), true);

      // Give the async upsert a tick to land.
      await wait(20);
      assert.equal(upserts.length, 1);
      assert.equal(upserts[0]?.sessionId, "sess-smoke-1");
      assert.equal(upserts[0]?.statusType, AcctStatusType.Start);
    } finally {
      client.close();
      await wait(20);
    }
  });

  it("silently drops accounting packets with a bad Request Authenticator", async () => {
    const client = createSocket("udp4");
    try {
      upserts.length = 0;

      const draft: RadiusPacket = {
        code: RadiusCode.AccountingRequest,
        identifier: 0x66,
        // Bogus authenticator — not derived from packet content + secret.
        authenticator: Buffer.alloc(16, 0xff),
        attributes: [
          stringAttribute(AttrType.UserName, "evil"),
          stringAttribute(AttrType.AcctSessionId, "sess-evil"),
          integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start),
        ],
      };

      let received: Buffer | null = null;
      client.on("message", (msg) => {
        received = msg;
      });
      client.send(encode(draft), ACCT_PORT, "127.0.0.1");
      await wait(250);

      assert.equal(received, null, "should not reply to forged acct packet");
      assert.equal(upserts.length, 0, "should not have persisted anything");
    } finally {
      client.close();
      await wait(20);
    }
  });

  it("auth socket refuses an Accounting-Request (role guard)", async () => {
    const client = createSocket("udp4");
    try {
      upserts.length = 0;
      const { wire } = buildAcctStart();

      let received: Buffer | null = null;
      client.on("message", (msg) => {
        received = msg;
      });
      // Same packet but sent to the *auth* port — server should drop it.
      client.send(wire, AUTH_PORT, "127.0.0.1");
      await wait(250);

      assert.equal(received, null, "auth socket must not reply to acct packets");
      assert.equal(upserts.length, 0);
    } finally {
      client.close();
      await wait(20);
    }
  });
});
