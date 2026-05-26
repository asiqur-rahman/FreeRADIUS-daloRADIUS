// ─────────────────────────────────────────────────────────────────────
//  Dispatcher end-to-end tests.
//
//  These exercise the full Access-Request pipeline (parse → method
//  selection → method verify → response construction) with an in-memory
//  auth backend, so they run hermetically. No UDP, no DB.
//
//  Together with mschap.test.ts (RFC 2759 vectors) and the wire smoke
//  test, this gives us covered: protocol, method crypto, dispatch logic.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";

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
  computeNtResponse,
  challengeHash,
  MicrosoftVsa,
  nthashOfPassword,
} from "../src/protocol/mschap.js";
import { encryptUserPassword } from "../src/protocol/user-password.js";
import { VendorId, vendorAttribute } from "../src/protocol/vendor.js";
import { handleAccessRequest } from "../src/auth/dispatch.js";
import type { AuthBackend, AuthSubject } from "../src/auth/common.js";

// Process-level config setup so tsx/log import side-effects are quiet.
process.env.DATABASE_URL ??= "postgresql://x:y@localhost:5432/x";
process.env.LOG_LEVEL = "error";

const NAS = {
  id: "nas-test",
  nasname: "10.0.0.1",
  shortname: "test-nas",
  secret: "test-secret-32-chars-aaaaaaaaaaaaa",
  type: "other",
  coaPort: 3799,
  enabled: true,
  siteId: null,
};

function makeBackend(subject: AuthSubject | null): { backend: AuthBackend; logs: { reply: string; class: string | null | undefined }[] } {
  const logs: { reply: string; class: string | null | undefined }[] = [];
  return {
    backend: {
      loadSubject: async () => subject,
      logPostAuth: async (entry) => {
        logs.push({ reply: entry.reply, class: entry.class });
      },
    },
    logs,
  };
}

function makeSubject(opts: { username: string; ntHash?: Buffer; argonHash: string; status?: "active" | "suspended" }): AuthSubject {
  const ntHash = opts.ntHash ?? Buffer.alloc(16, 0);
  return {
    user: {
      id: "u1",
      username: opts.username,
      email: `${opts.username}@example.test`,
      fullName: null,
      role: "user",
      status: opts.status ?? "active",
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
      passwordHashArgon2id: opts.argonHash,
      ntHash: ntHash.toString("hex").toUpperCase(),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      failedAttempts: 0,
      lockedUntil: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

// ── PAP ─────────────────────────────────────────────────────────────

describe("dispatch → PAP", () => {
  it("accepts a correct password", async () => {
    const password = "correct-horse-battery-staple";
    const argonHash = await argon2.hash(password, { type: argon2.argon2id });
    const subject = makeSubject({ username: "alice", argonHash });
    const { backend, logs } = makeBackend(subject);

    const reqAuth = randomBytes(16);
    const cipher = encryptUserPassword(password, NAS.secret, reqAuth);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: reqAuth,
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.UserPassword, value: cipher },
      ],
    };

    const response = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(response.code, RadiusCode.AccessAccept);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.reply, "Access-Accept");
    assert.equal(logs[0]?.class, "pap");
  });

  it("rejects a wrong password and logs bad_password", async () => {
    const argonHash = await argon2.hash("real-password", { type: argon2.argon2id });
    const subject = makeSubject({ username: "alice", argonHash });
    const { backend, logs } = makeBackend(subject);

    const reqAuth = randomBytes(16);
    const cipher = encryptUserPassword("wrong-password", NAS.secret, reqAuth);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 2,
      authenticator: reqAuth,
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.UserPassword, value: cipher },
      ],
    };

    const response = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(response.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "bad_password");
  });

  it("rejects a suspended account before checking the password", async () => {
    const argonHash = await argon2.hash("anything", { type: argon2.argon2id });
    const subject = makeSubject({ username: "alice", argonHash, status: "suspended" });
    const { backend, logs } = makeBackend(subject);
    const reqAuth = randomBytes(16);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 3,
      authenticator: reqAuth,
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.UserPassword, value: encryptUserPassword("anything", NAS.secret, reqAuth) },
      ],
    };
    const response = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(response.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "inactive");
  });
});

// ── MSCHAPv2 ────────────────────────────────────────────────────────

describe("dispatch → MSCHAPv2", () => {
  it("accepts a valid response and emits MS-CHAP2-Success", async () => {
    const password = "clientPass";
    const ntHash = nthashOfPassword(password);
    const subject = makeSubject({ username: "user", argonHash: "unused", ntHash });
    const { backend, logs } = makeBackend(subject);

    const authChallenge = randomBytes(16);
    const peerChallenge = randomBytes(16);
    const username = "user";

    // Use the *raw* username for ChallengeHash (what the supplicant uses).
    const chHash = challengeHash(peerChallenge, authChallenge, username);
    const ntResponse = computeNtResponse(ntHash, chHash);

    // Build MS-CHAP2-Response value: Ident(1) | Flags(1) | Peer(16) | Reserved(8) | NT(24)
    const response50 = Buffer.alloc(50);
    response50[0] = 0x77; // ident
    response50[1] = 0; // flags
    peerChallenge.copy(response50, 2);
    // bytes 18..26 reserved zero
    ntResponse.copy(response50, 26);

    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 10,
      authenticator: randomBytes(16),
      attributes: [
        stringAttribute(AttrType.UserName, username),
        vendorAttribute(VendorId.Microsoft, MicrosoftVsa.MsChapChallenge, authChallenge),
        vendorAttribute(VendorId.Microsoft, MicrosoftVsa.MsChap2Response, response50),
      ],
    };

    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessAccept);
    assert.equal(logs[0]?.class, "mschapv2");

    // The reply must include MS-CHAP2-Success. Decode and look it up.
    const wire = encode({ ...reply, identifier: 10 });
    const round = decode(wire);
    const successAttr = round.attributes.find((a) => a.type === AttrType.VendorSpecific);
    assert.ok(successAttr);
    // The "S=" payload should be exactly 1 (ident) + 2 + 40 + " M=..." bytes.
    const successText = successAttr.value.toString("ascii");
    assert.match(successText, /S=[0-9A-F]{40} M=/);
  });

  it("rejects a tampered NT-Response", async () => {
    const password = "clientPass";
    const ntHash = nthashOfPassword(password);
    const subject = makeSubject({ username: "user", argonHash: "unused", ntHash });
    const { backend, logs } = makeBackend(subject);

    const authChallenge = randomBytes(16);
    const peerChallenge = randomBytes(16);

    const response50 = Buffer.alloc(50);
    response50[0] = 0x77;
    peerChallenge.copy(response50, 2);
    // NT-Response is just random garbage — should not match.
    randomBytes(24).copy(response50, 26);

    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 11,
      authenticator: randomBytes(16),
      attributes: [
        stringAttribute(AttrType.UserName, "user"),
        vendorAttribute(VendorId.Microsoft, MicrosoftVsa.MsChapChallenge, authChallenge),
        vendorAttribute(VendorId.Microsoft, MicrosoftVsa.MsChap2Response, response50),
      ],
    };

    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "bad_password");
  });
});

// ── No method present ──────────────────────────────────────────────

describe("dispatch → fallthrough", () => {
  it("rejects when no auth attribute is present", async () => {
    const subject = makeSubject({ username: "alice", argonHash: await argon2.hash("x", { type: argon2.argon2id }) });
    const { backend, logs } = makeBackend(subject);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 20,
      authenticator: randomBytes(16),
      attributes: [stringAttribute(AttrType.UserName, "alice")],
    };
    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "no_auth_method");
  });

  it("rejects CHAP with an unsupported reason", async () => {
    const subject = makeSubject({ username: "alice", argonHash: await argon2.hash("x", { type: argon2.argon2id }) });
    const { backend, logs } = makeBackend(subject);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 21,
      authenticator: randomBytes(16),
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.ChapPassword, value: Buffer.alloc(17) },
      ],
    };
    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "chap_unsupported");
    const msg = findAttribute(reply, AttrType.ReplyMessage);
    assert.ok(msg);
    assert.match(msg.value.toString("utf8"), /CHAP/);
  });

  it("rejects unknown users without disclosing existence", async () => {
    const { backend, logs } = makeBackend(null);
    const request: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 22,
      authenticator: randomBytes(16),
      attributes: [
        stringAttribute(AttrType.UserName, "ghost"),
        { type: AttrType.UserPassword, value: encryptUserPassword("anything", NAS.secret, Buffer.alloc(16)) },
      ],
    };
    const reply = await handleAccessRequest(request, { nas: NAS, backend });
    assert.equal(reply.code, RadiusCode.AccessReject);
    assert.equal(logs[0]?.class, "unknown_user");
    const msg = findAttribute(reply, AttrType.ReplyMessage);
    assert.equal(msg?.value.toString("utf8"), "Authentication failed");
  });
});
