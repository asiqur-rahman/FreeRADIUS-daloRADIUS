// ─────────────────────────────────────────────────────────────────────
//  End-to-end EAP-MSCHAPv2 conversation against the dispatcher.
//
//  Plays the role of a supplicant for three RADIUS rounds:
//    1. EAP-Response/Identity → expect Access-Challenge with MSCHAPv2 challenge
//    2. EAP-Response/MSCHAPv2(Response) → expect Access-Challenge with Success
//    3. EAP-Response/MSCHAPv2(Success ack) → expect Access-Accept with EAP-Success
//
//  Wrong-password path also tested.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";

import { AttrType } from "../src/protocol/attributes.js";
import {
  findAttribute,
  getConcatenated,
  octetsAttribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  decodeEap,
  EapCode,
  EapType,
  encodeEap,
} from "../src/protocol/eap.js";
import {
  challengeHash,
  computeNtResponse,
  nthashOfPassword,
} from "../src/protocol/mschap.js";
import { MsChapV2OpCode } from "../src/eap/methods/mschapv2.js";
import { clearAllEapSessions } from "../src/eap/state.js";
import { handleAccessRequest } from "../src/auth/dispatch.js";
import type { AuthBackend, AuthSubject } from "../src/auth/common.js";

const NAS = {
  id: "nas-1",
  nasname: "10.0.0.1",
  shortname: "test-nas",
  secret: "secret",
  type: "other",
  coaPort: 3799,
  enabled: true,
  siteId: null,
};

function makeBackend(subject: AuthSubject | null) {
  const logs: Array<{ reply: string; class: string | null | undefined }> = [];
  const backend: AuthBackend = {
    loadSubject: async () => subject,
    logPostAuth: async (entry) => {
      logs.push({ reply: entry.reply, class: entry.class });
    },
  };
  return { backend, logs };
}

function makeSubject(opts: { username: string; ntHash: Buffer }): AuthSubject {
  return {
    user: {
      id: "u1",
      username: opts.username,
      email: `${opts.username}@x.test`,
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
      passwordHashArgon2id: "$argon2id$v=19$m=65536,t=3,p=4$ZGVmYXVsdHNhbHQAAAAAAAAAAA$LzZkXh4MJxgM2Cu3xVbQQNDOPnVcgKHZP8b0vYxv4f8",
      ntHash: opts.ntHash.toString("hex").toUpperCase(),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      failedAttempts: 0,
      lockedUntil: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

function makeAccessRequest(eapBytes: Buffer, opts: { username?: string; state?: Buffer } = {}): RadiusPacket {
  const attrs = [
    stringAttribute(AttrType.UserName, opts.username ?? "user"),
    { type: AttrType.EapMessage, value: eapBytes },
  ];
  if (opts.state) attrs.push(octetsAttribute(AttrType.State, opts.state));
  return {
    code: RadiusCode.AccessRequest,
    identifier: 1,
    authenticator: randomBytes(16),
    attributes: attrs,
  };
}

function extractEap(packet: RadiusPacket): Buffer {
  const eap = getConcatenated(packet, AttrType.EapMessage);
  if (!eap) throw new Error("no EAP-Message in response");
  return eap;
}

function extractState(packet: RadiusPacket): Buffer {
  const state = findAttribute(packet, AttrType.State);
  if (!state) throw new Error("no State attribute");
  return state.value;
}

describe("EAP-MSCHAPv2 dispatcher flow", () => {
  it("completes a happy-path 3-round exchange to Access-Accept", async () => {
    clearAllEapSessions();
    const password = "clientPass";
    const ntHash = nthashOfPassword(password);
    const subject = makeSubject({ username: "user", ntHash });
    const { backend, logs } = makeBackend(subject);

    // Round 1: send EAP-Response/Identity
    const identityEap = encodeEap({
      code: EapCode.Response,
      identifier: 1,
      type: EapType.Identity,
      data: Buffer.from("user", "utf8"),
    });
    const round1 = await handleAccessRequest(
      makeAccessRequest(identityEap, { username: "user" }),
      { nas: NAS, backend },
    );
    assert.equal(round1.code, RadiusCode.AccessChallenge);

    // Parse server's Challenge
    const r1eap = decodeEap(extractEap(round1));
    assert.equal(r1eap.code, EapCode.Request);
    assert.equal(r1eap.type, EapType.MsChapV2);
    assert.equal(r1eap.data[0], MsChapV2OpCode.Challenge);
    // value-size at offset 4
    assert.equal(r1eap.data[4], 16);
    const authChallenge = r1eap.data.subarray(5, 21);
    assert.equal(authChallenge.length, 16);
    const r1state = extractState(round1);

    // Round 2: send EAP-Response/MSCHAPv2 (Response) using the auth challenge
    const peerChallenge = randomBytes(16);
    const ch = challengeHash(peerChallenge, authChallenge, "user");
    const ntResponse = computeNtResponse(ntHash, ch);

    // Build response payload: opcode=Response | id | length | value-size=49
    //                       | PeerCh(16) | Reserved(8) | NTResp(24) | Flags(1) | Name
    const name = Buffer.from("user", "utf8");
    const data = Buffer.alloc(1 + 1 + 2 + 1 + 49 + name.length);
    data[0] = MsChapV2OpCode.Response;
    data[1] = r1eap.data[1] ?? 0; // mschap-id from challenge
    data.writeUInt16BE(data.length, 2);
    data[4] = 49;
    peerChallenge.copy(data, 5);
    // 8 bytes reserved already zero
    ntResponse.copy(data, 29);
    data[53] = 0; // flags
    name.copy(data, 54);

    const responseEap = encodeEap({
      code: EapCode.Response,
      identifier: r1eap.identifier,
      type: EapType.MsChapV2,
      data,
    });
    const round2 = await handleAccessRequest(
      makeAccessRequest(responseEap, { username: "user", state: r1state }),
      { nas: NAS, backend },
    );
    assert.equal(round2.code, RadiusCode.AccessChallenge);

    const r2eap = decodeEap(extractEap(round2));
    assert.equal(r2eap.code, EapCode.Request);
    assert.equal(r2eap.type, EapType.MsChapV2);
    assert.equal(r2eap.data[0], MsChapV2OpCode.Success);
    assert.match(r2eap.data.toString("ascii", 1), /^S=[0-9A-F]{40} M=/);
    const r2state = extractState(round2);

    // Round 3: send EAP-Response/MSCHAPv2 (Success ack — just opcode byte)
    const ackEap = encodeEap({
      code: EapCode.Response,
      identifier: r2eap.identifier,
      type: EapType.MsChapV2,
      data: Buffer.from([MsChapV2OpCode.Success]),
    });
    const round3 = await handleAccessRequest(
      makeAccessRequest(ackEap, { username: "user", state: r2state }),
      { nas: NAS, backend },
    );

    assert.equal(round3.code, RadiusCode.AccessAccept);
    const r3eap = decodeEap(extractEap(round3));
    assert.equal(r3eap.code, EapCode.Success);
    assert.equal(logs.at(-1)?.class, "eap-mschapv2");
  });

  it("rejects when the NT-Response is wrong", async () => {
    clearAllEapSessions();
    const subject = makeSubject({ username: "user", ntHash: nthashOfPassword("realPass") });
    const { backend, logs } = makeBackend(subject);

    // Round 1
    const identityEap = encodeEap({
      code: EapCode.Response,
      identifier: 1,
      type: EapType.Identity,
      data: Buffer.from("user", "utf8"),
    });
    const r1 = await handleAccessRequest(
      makeAccessRequest(identityEap, { username: "user" }),
      { nas: NAS, backend },
    );
    const r1eap = decodeEap(extractEap(r1));
    const r1state = extractState(r1);

    // Round 2 — send garbage NT-Response
    const data = Buffer.alloc(1 + 1 + 2 + 1 + 49 + 4);
    data[0] = MsChapV2OpCode.Response;
    data[1] = r1eap.data[1] ?? 0;
    data.writeUInt16BE(data.length, 2);
    data[4] = 49;
    randomBytes(16).copy(data, 5); // peer challenge
    randomBytes(24).copy(data, 29); // bogus NT-response
    Buffer.from("user").copy(data, 54);

    const responseEap = encodeEap({
      code: EapCode.Response,
      identifier: r1eap.identifier,
      type: EapType.MsChapV2,
      data,
    });
    const r2 = await handleAccessRequest(
      makeAccessRequest(responseEap, { username: "user", state: r1state }),
      { nas: NAS, backend },
    );
    assert.equal(r2.code, RadiusCode.AccessReject);
    const r2eap = decodeEap(extractEap(r2));
    assert.equal(r2eap.code, EapCode.Failure);
    assert.equal(logs.at(-1)?.class, "bad_password");
  });

  it("drops the second round when the State doesn't match any session", async () => {
    clearAllEapSessions();
    const subject = makeSubject({ username: "user", ntHash: nthashOfPassword("x") });
    const { backend } = makeBackend(subject);

    const fakeState = randomBytes(16);
    const eap = encodeEap({
      code: EapCode.Response,
      identifier: 2,
      type: EapType.MsChapV2,
      data: Buffer.from([MsChapV2OpCode.Response, 0, 0, 0, 49]),
    });
    const reply = await handleAccessRequest(
      makeAccessRequest(eap, { username: "user", state: fakeState }),
      { nas: NAS, backend },
    );
    assert.equal(reply.code, RadiusCode.AccessReject);
  });
});
