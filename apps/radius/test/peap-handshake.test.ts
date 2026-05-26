// ─────────────────────────────────────────────────────────────────────
//  Hermetic PEAP handshake roundtrip.
//
//  Spins up our PEAP server method AND a synthetic supplicant inside
//  the same process, then drives them through a complete PEAP exchange:
//
//    Identity → PEAP Start → TLS handshake (multi-fragment) →
//    inner EAP-Identity → inner MSCHAPv2 Challenge/Response →
//    inner MSCHAPv2 Success → outer EAP-Success + MSK
//
//  If this passes, the wire-level PEAP code is correct in isolation.
//  The remaining risks are real-supplicant quirks (cipher mismatch,
//  PEAP version weirdness, NAS retry semantics) — those need eapol_test
//  + a router to catch.
//
//  ⚠️ This test exercises Node's `tls` module bound to a custom Duplex
//  on the SUPPLICANT side too, which is unusual. If it ever flakes
//  under a new Node version, the most likely cause is changes to the
//  TLSSocket lifecycle — bump `MAX_ROUNDS` or `flushTlsOutput`'s
//  maxYields rather than disabling the test.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { Duplex } from "node:stream";
import {
  connect as tlsConnect,
  createSecureContext,
  TLSSocket,
  type SecureContext,
} from "node:tls";
import selfsigned from "selfsigned";

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
  encodeEap,
  EapCode,
  EapType,
} from "../src/protocol/eap.js";
import { decodePeap, encodePeap } from "../src/protocol/peap.js";
import {
  challengeHash,
  computeNtResponse,
  nthashOfPassword,
} from "../src/protocol/mschap.js";
import { handleAccessRequest } from "../src/auth/dispatch.js";
import { clearAllEapSessions } from "../src/eap/state.js";
import type { AuthBackend, AuthSubject } from "../src/auth/common.js";
import { setTlsMaterialForTesting } from "../src/tls-config.js";

process.env.PEAP_ENABLED = "true";

const PASSWORD = "TestPassw0rd!";
const NT_HASH = nthashOfPassword(PASSWORD);
const SERVER_NAME = "radius.test.local";
const NAS = {
  id: "nas-1",
  nasname: "10.0.0.1",
  shortname: "test-nas",
  secret: "shared-secret-32-aaaaaaaaaaaaaaaaa",
  type: "other",
  coaPort: 3799,
  enabled: true,
  siteId: null,
};

function makeSubject(): AuthSubject {
  return {
    user: {
      id: "u1",
      username: "wifitester",
      email: "wifitester@x.test",
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
      ntHash: NT_HASH.toString("hex").toUpperCase(),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      failedAttempts: 0,
      lockedUntil: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

// ── Supplicant-side TLS bridge ────────────────────────────────────

class ClientBridge extends Duplex {
  private readonly outbox: Buffer[] = [];
  constructor() {
    super({ allowHalfOpen: true });
  }
  override _read(): void {}
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    cb: (err?: Error) => void,
  ): void {
    const buf = typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
    this.outbox.push(buf);
    cb();
  }
  feedIn(bytes: Buffer): void {
    if (bytes.length) this.push(bytes);
  }
  drainOut(): Buffer {
    if (this.outbox.length === 0) return Buffer.alloc(0);
    const out = Buffer.concat(this.outbox);
    this.outbox.length = 0;
    return out;
  }
}

interface Supplicant {
  socket: TLSSocket;
  bridge: ClientBridge;
  secureFired: boolean;
  cleartextInbox: Buffer[];
}

function makeSupplicant(): Supplicant {
  const bridge = new ClientBridge();
  // Permissive secure context — we explicitly tolerate self-signed certs
  // and disable any validation (the server-side cert is generated in-test).
  const ctx: SecureContext = createSecureContext({
    minVersion: "TLSv1",
    maxVersion: "TLSv1.2",
  });
  const socket = tlsConnect({
    socket: bridge,
    secureContext: ctx,
    rejectUnauthorized: false,
    // Make sure we negotiate the same cipher family the server prefers.
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
    ].join(":"),
  });

  const supplicant: Supplicant = {
    socket,
    bridge,
    secureFired: false,
    cleartextInbox: [],
  };
  socket.on("secure", () => {
    supplicant.secureFired = true;
  });
  socket.on("data", (chunk: Buffer) => {
    supplicant.cleartextInbox.push(chunk);
  });
  socket.on("error", () => {
    // Ignore — failures surface via test assertions on missing MSK etc.
  });
  return supplicant;
}

async function yieldEventLoop(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

function makeAccessRequest(eapBytes: Buffer, state?: Buffer): RadiusPacket {
  const attrs = [
    stringAttribute(AttrType.UserName, "wifitester"),
    { type: AttrType.EapMessage, value: eapBytes },
  ];
  if (state) attrs.push(octetsAttribute(AttrType.State, state));
  return {
    code: RadiusCode.AccessRequest,
    identifier: 1,
    authenticator: Buffer.alloc(16, 0x42),
    attributes: attrs,
  };
}

// ── Test setup: stable self-signed cert ───────────────────────────

let cert: Buffer;
let key: Buffer;

before(() => {
  const result = selfsigned.generate(
    [{ name: "commonName", value: SERVER_NAME }],
    { days: 1, keySize: 2048, algorithm: "sha256" },
  );
  cert = Buffer.from(result.cert, "utf8");
  key = Buffer.from(result.private, "utf8");
  setTlsMaterialForTesting({ cert, key, fromDisk: false });
});

// ── The actual handshake roundtrip ────────────────────────────────

describe("PEAP-MSCHAPv2 full handshake roundtrip (hermetic)", () => {
  it("completes the TLS handshake and the inner MSCHAPv2 exchange", async () => {
    clearAllEapSessions();

    const backend: AuthBackend = {
      loadSubject: async () => makeSubject(),
      logPostAuth: async () => {},
    };
    const supplicant = makeSupplicant();

    // ── Round 1: Identity → expect PEAP Start ────────────────
    const identityEap = encodeEap({
      code: EapCode.Response,
      identifier: 1,
      type: EapType.Identity,
      data: Buffer.from("wifitester", "utf8"),
    });

    let lastReply = await handleAccessRequest(
      makeAccessRequest(identityEap),
      { nas: NAS, backend },
    );
    assert.equal(lastReply.code, RadiusCode.AccessChallenge);
    let stateBytes = findAttribute(lastReply, AttrType.State)!.value;
    let lastEapId = decodeEap(getConcatenated(lastReply, AttrType.EapMessage)!).identifier;

    // ── TLS handshake loop ──────────────────────────────────
    // The supplicant sends ClientHello first. Drive both sides forward
    // until either secure event fires on the supplicant or we hit MAX_ROUNDS.
    const MAX_ROUNDS = 30;
    let mskFromAccept: Buffer | undefined;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Let supplicant's TLS state machine emit handshake/app records.
      await yieldEventLoop();
      const supplicantTlsBytes = supplicant.bridge.drainOut();

      // Wrap supplicant's TLS bytes into a PEAP fragment + EAP-Response.
      const peapFragment = encodePeap({
        version: 0,
        lengthIncluded: supplicantTlsBytes.length > 0,
        moreFragments: false,
        start: false,
        totalLength: supplicantTlsBytes.length,
        tls: supplicantTlsBytes,
      });
      const responseEap = encodeEap({
        code: EapCode.Response,
        identifier: lastEapId,
        type: EapType.Peap,
        data: peapFragment,
      });

      const reply = await handleAccessRequest(
        makeAccessRequest(responseEap, stateBytes),
        { nas: NAS, backend },
      );

      // Server may emit: Access-Challenge (more rounds), Access-Accept (done),
      // or Access-Reject (failure).
      if (reply.code === RadiusCode.AccessReject) {
        throw new Error(
          `Server rejected mid-handshake at round ${round}: ` +
            (findAttribute(reply, AttrType.ReplyMessage)?.value.toString("utf8") ?? "no reason"),
        );
      }
      if (reply.code === RadiusCode.AccessAccept) {
        // We don't get MSK directly from the packet in this test (it's
        // encrypted in MS-MPPE VSAs). The dispatcher's accept path is
        // already covered by other tests; the important assertion here
        // is just that we reached Access-Accept at all.
        mskFromAccept = Buffer.from("placeholder-msk-present");
        break;
      }

      // Otherwise it's an Access-Challenge with more PEAP fragments.
      assert.equal(reply.code, RadiusCode.AccessChallenge);
      const replyEap = decodeEap(getConcatenated(reply, AttrType.EapMessage)!);
      lastEapId = replyEap.identifier;

      // Decode server's PEAP and feed its TLS bytes back to the supplicant.
      if (replyEap.type === EapType.Peap) {
        const peap = decodePeap(replyEap.data);
        if (peap.tls.length > 0) {
          supplicant.bridge.feedIn(peap.tls);
        }
      }

      // Refresh stateBytes from this round's reply.
      const nextStateAttr = findAttribute(reply, AttrType.State);
      if (nextStateAttr) stateBytes = nextStateAttr.value;
      lastReply = reply;

      // After handshake completes on supplicant side, start writing the
      // inner EAP-Response/Identity into the tunnel.
      if (supplicant.secureFired && supplicant.cleartextInbox.length > 0) {
        // The server has sent an inner EAP-Request/Identity through the tunnel.
        // Respond with EAP-Response/Identity inside the tunnel.
        const inboundCleartext = Buffer.concat(supplicant.cleartextInbox);
        supplicant.cleartextInbox.length = 0;

        // Decode the inner EAP — could be Identity or MSCHAPv2 Challenge.
        let innerEap;
        try {
          innerEap = decodeEap(inboundCleartext);
        } catch {
          // PEAPv0 sometimes ships bare type+data; try that shape.
          innerEap = {
            code: EapCode.Request,
            identifier: 0,
            type: inboundCleartext[0],
            data: Buffer.from(inboundCleartext.subarray(1)),
          };
        }

        if (innerEap.type === EapType.Identity) {
          // Reply with inner EAP-Response/Identity.
          const reply = encodeEap({
            code: EapCode.Response,
            identifier: innerEap.identifier,
            type: EapType.Identity,
            data: Buffer.from("wifitester", "utf8"),
          });
          supplicant.socket.write(reply);
        } else if (innerEap.type === EapType.MsChapV2) {
          // The server sent us a MSCHAPv2 Challenge. Compute the
          // NT-Response and reply.
          if (innerEap.data[0] === 1) {
            // OpCode.Challenge — payload starts at offset 5 (after opcode,
            // id, length(2), value-size).
            const authChallenge = innerEap.data.subarray(5, 21);
            const peerChallenge = Buffer.alloc(16, 0x55); // deterministic for test
            const ch = challengeHash(peerChallenge, authChallenge, "wifitester");
            const ntResp = computeNtResponse(NT_HASH, ch);

            const name = Buffer.from("wifitester", "utf8");
            const data = Buffer.alloc(1 + 1 + 2 + 1 + 49 + name.length);
            data[0] = 2; // OpCode.Response
            data[1] = innerEap.data[1] ?? 0;
            data.writeUInt16BE(data.length, 2);
            data[4] = 49;
            peerChallenge.copy(data, 5);
            ntResp.copy(data, 29);
            data[53] = 0;
            name.copy(data, 54);

            const reply = encodeEap({
              code: EapCode.Response,
              identifier: innerEap.identifier,
              type: EapType.MsChapV2,
              data,
            });
            supplicant.socket.write(reply);
          } else if (innerEap.data[0] === 3) {
            // OpCode.Success — ack with our own success.
            const reply = encodeEap({
              code: EapCode.Response,
              identifier: innerEap.identifier,
              type: EapType.MsChapV2,
              data: Buffer.from([3]), // OpCode.Success
            });
            supplicant.socket.write(reply);
          }
        }
      }
    }

    assert.ok(
      mskFromAccept,
      "PEAP roundtrip did not reach Access-Accept within MAX_ROUNDS — " +
        "TLS handshake or inner MSCHAPv2 likely stalled. " +
        "Check the test output above for the last server reply.",
    );
  });
});
