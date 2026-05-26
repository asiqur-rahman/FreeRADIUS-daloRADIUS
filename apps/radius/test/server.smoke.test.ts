// ─────────────────────────────────────────────────────────────────────
//  End-to-end smoke test for the UDP server pipeline.
//
//  This test does NOT touch Postgres — it stubs the NAS lookup module
//  so the test runs in isolation. The full DB-backed path will be
//  covered by an integration test once compose is up.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { createSocket } from "node:dgram";
import { describe, it, before, after } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import { AttrType, MESSAGE_AUTHENTICATOR_VALUE_LENGTH } from "../src/protocol/attributes.js";
import {
  decode,
  encode,
  findAttribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  computeMessageAuthenticator,
  randomAuthenticator,
  verifyResponseAuthenticator,
} from "../src/protocol/authenticators.js";

const SECRET = "smoke-test-secret";
const TEST_PORT = 21812;       // pick ports outside the IANA RADIUS range so we
const TEST_ACCT_PORT = 21813;  // never clash with a host FreeRADIUS install.

// Test config: never connect to Postgres — we inject the NAS lookup.
process.env.DATABASE_URL ??= "postgresql://x:y@localhost:5432/x";
process.env.RADIUS_AUTH_PORT = String(TEST_PORT);
process.env.RADIUS_ACCT_PORT = String(TEST_ACCT_PORT);
process.env.RADIUS_COA_PORT = "21814";
process.env.RADIUS_HOST = "127.0.0.1";
process.env.LOG_LEVEL = "error";

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
    // No users → every Access-Request gets rejected with "unknown_user".
    // That's enough for A1-A2 wire-level smoke tests; method-level tests
    // live in mschap.test.ts / user-password.test.ts.
    loadSubject: async () => null,
    logPostAuth: async () => {},
  },
  acctBackend: {
    upsertSession: async () => {},
    closeNasSessions: async () => 0,
  },
});

before(async () => {
  await server.listen();
});

after(async () => {
  await server.close();
});

function buildAccessRequest(): { wire: Buffer; reqAuth: Buffer; identifier: number } {
  const reqAuth = randomAuthenticator();
  const identifier = 0x33;
  const draft: RadiusPacket = {
    code: RadiusCode.AccessRequest,
    identifier,
    authenticator: reqAuth,
    attributes: [
      stringAttribute(AttrType.UserName, "alice"),
      {
        type: AttrType.MessageAuthenticator,
        value: Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH),
      },
    ],
  };
  // Compute Message-Authenticator over the packet with msg-auth zeroed.
  const hmac = computeMessageAuthenticator(encode(draft), SECRET);
  const signed: RadiusPacket = {
    ...draft,
    attributes: draft.attributes.map((a) =>
      a.type === AttrType.MessageAuthenticator ? { type: a.type, value: hmac } : a,
    ),
  };
  return { wire: encode(signed), reqAuth, identifier };
}

describe("server smoke", () => {
  it("replies Access-Reject with a valid Response Authenticator", async () => {
    const client = createSocket("udp4");
    try {
      const { wire, reqAuth, identifier } = buildAccessRequest();

      const replyPromise = new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no reply in 2s")), 2000);
        client.once("message", (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      client.send(wire, TEST_PORT, "127.0.0.1");

      const reply = await replyPromise;
      const decoded = decode(reply);

      assert.equal(decoded.code, RadiusCode.AccessReject);
      assert.equal(decoded.identifier, identifier);
      assert.equal(verifyResponseAuthenticator(reply, reqAuth, SECRET), true);

      const replyMessage = findAttribute(decoded, AttrType.ReplyMessage);
      assert.ok(replyMessage);
      assert.match(replyMessage.value.toString("utf8"), /Authentication failed/);
    } finally {
      client.close();
      // Tiny delay so dgram cleans up before the after-hook runs.
      await wait(20);
    }
  });

  it("silently drops a packet signed under the wrong secret", async () => {
    const client = createSocket("udp4");
    try {
      // Forge a packet but compute its Message-Authenticator with the
      // wrong secret. The server should ignore it entirely.
      const draft: RadiusPacket = {
        code: RadiusCode.AccessRequest,
        identifier: 0x44,
        authenticator: randomAuthenticator(),
        attributes: [
          stringAttribute(AttrType.UserName, "evil"),
          {
            type: AttrType.MessageAuthenticator,
            value: Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH),
          },
        ],
      };
      const hmac = computeMessageAuthenticator(encode(draft), "wrong-secret");
      const signed: RadiusPacket = {
        ...draft,
        attributes: draft.attributes.map((a) =>
          a.type === AttrType.MessageAuthenticator ? { type: a.type, value: hmac } : a,
        ),
      };

      let received: Buffer | null = null;
      client.on("message", (msg) => {
        received = msg;
      });
      client.send(encode(signed), TEST_PORT, "127.0.0.1");

      // Give the server 250ms to (not) reply.
      await wait(250);
      assert.equal(received, null, "server should not reply to forged packet");
    } finally {
      client.close();
      await wait(20);
    }
  });
});
