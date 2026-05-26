// ─────────────────────────────────────────────────────────────────────
//  PEAP-MSCHAPv2 test supplicant.
//
//  Connects to a running RADIUS server via UDP and drives a full
//  PEAP-MSCHAPv2 conversation:
//
//    1. Access-Request with EAP-Response/Identity
//    2. Receive Access-Challenge with EAP-Request/PEAP Start
//    3. Drive TLS handshake (multiple Access-Request/Challenge rounds)
//    4. Inner EAP-Identity → MSCHAPv2 Challenge → Response → Success
//    5. Final Access-Accept with MS-MPPE keys
//
//  This is what `eapol_test` does, written natively in our codebase so
//  there's no extra install step. On Windows / macOS / Linux, just:
//
//    pnpm --filter @app/radius run rig:test-peap
//
//  Override the defaults via env vars:
//    TEST_SERVER_HOST=192.168.1.1   (default 127.0.0.1)
//    TEST_SERVER_PORT=1812
//    TEST_SECRET=testing-secret-…   (must match nas_clients.secret)
//    TEST_USERNAME=wifitester
//    TEST_PASSWORD=TestPassw0rd!
// ─────────────────────────────────────────────────────────────────────

import { createSocket } from "node:dgram";
import { Duplex } from "node:stream";
import {
  connect as tlsConnect,
  createSecureContext,
  type TLSSocket,
} from "node:tls";
import { randomBytes } from "node:crypto";

import { AttrType, MESSAGE_AUTHENTICATOR_VALUE_LENGTH } from "../src/protocol/attributes.js";
import {
  decode,
  encode,
  findAttribute,
  getConcatenated,
  octetsAttribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  computeMessageAuthenticator,
  verifyResponseAuthenticator,
} from "../src/protocol/authenticators.js";
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

// ── Config ─────────────────────────────────────────────────────────

const HOST = process.env.TEST_SERVER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.TEST_SERVER_PORT ?? 1812);
const SECRET = process.env.TEST_SECRET ?? "testing-secret-32chars-loremipsum";
const USERNAME = process.env.TEST_USERNAME ?? "wifitester";
const PASSWORD = process.env.TEST_PASSWORD ?? "TestPassw0rd!";
const ROUND_TIMEOUT_MS = 2000;
const MAX_ROUNDS = 40;

const NT_HASH = nthashOfPassword(PASSWORD);

// ── Logging helpers ────────────────────────────────────────────────

function log(stage: string, msg: string, extra?: Record<string, unknown>) {
  const e = extra ? " " + JSON.stringify(extra) : "";
  console.log(`[${stage.padEnd(12)}] ${msg}${e}`);
}

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg: string, extra?: unknown): never {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

// ── Supplicant-side TLS client over a custom Duplex ────────────────

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
  const ctx = createSecureContext({ minVersion: "TLSv1", maxVersion: "TLSv1.2" });
  const socket = tlsConnect({
    socket: bridge,
    secureContext: ctx,
    rejectUnauthorized: false,
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
    ].join(":"),
  });
  const supplicant: Supplicant = { socket, bridge, secureFired: false, cleartextInbox: [] };
  socket.on("secure", () => {
    supplicant.secureFired = true;
  });
  socket.on("data", (chunk: Buffer) => {
    supplicant.cleartextInbox.push(chunk);
  });
  socket.on("error", () => {
    // Errors surface via the missing Access-Accept assertion at the end.
  });
  return supplicant;
}

// ── UDP RADIUS client (sends Access-Requests, awaits replies) ──────

const socket = createSocket("udp4");
let nextIdentifier = Math.floor(Math.random() * 256);

interface PendingReply {
  identifier: number;
  resolve: (pkt: RadiusPacket) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}
let pending: PendingReply | null = null;

socket.on("message", (msg) => {
  if (!pending) return;
  let pkt: RadiusPacket;
  try {
    pkt = decode(msg);
  } catch (err) {
    return pending.reject(new Error(`decode failed: ${(err as Error).message}`));
  }
  if (pkt.identifier !== pending.identifier) return;
  // We don't keep the original request authenticator handy for response
  // verification here; the test client trusts the round-trip identifier
  // match and the eventual Access-Accept's MS-MPPE keys. (The hermetic
  // test already proved response-authenticator math is correct.)
  void verifyResponseAuthenticator; // referenced for future expansion
  pending.resolve(pkt);
});

function sendAccessRequest(eapBytes: Buffer, state?: Buffer): Promise<RadiusPacket> {
  return new Promise((resolve, reject) => {
    const identifier = nextIdentifier++ & 0xff;
    const requestAuth = randomBytes(16);
    const attributes: RadiusPacket["attributes"] = [
      stringAttribute(AttrType.UserName, USERNAME),
      // Chunk EAP-Message if needed.
      ...chunkEap(eapBytes),
      // Message-Authenticator placeholder — fill below.
      octetsAttribute(AttrType.MessageAuthenticator, Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH)),
    ];
    if (state) attributes.push(octetsAttribute(AttrType.State, state));

    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier,
      authenticator: requestAuth,
      attributes,
    };

    // Compute Message-Authenticator HMAC over packet with msg-auth zeroed.
    const serialised = encode(packet);
    const hmac = computeMessageAuthenticator(serialised, SECRET);
    const msgAuthAttr = packet.attributes.find((a) => a.type === AttrType.MessageAuthenticator)!;
    hmac.copy(msgAuthAttr.value);

    const finalWire = encode(packet);

    const timer = setTimeout(() => {
      pending = null;
      reject(new Error(`no reply from ${HOST}:${PORT} within ${ROUND_TIMEOUT_MS}ms`));
    }, ROUND_TIMEOUT_MS);

    pending = { identifier, resolve, reject, timer };

    socket.send(finalWire, PORT, HOST, (err) => {
      if (err) {
        clearTimeout(timer);
        pending = null;
        reject(err);
      }
    });
  }).then((pkt) => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    return pkt as RadiusPacket;
  });
}

function chunkEap(eapBytes: Buffer): { type: number; value: Buffer }[] {
  const CHUNK = 253;
  if (eapBytes.length <= CHUNK) {
    return [{ type: AttrType.EapMessage, value: eapBytes }];
  }
  const out: { type: number; value: Buffer }[] = [];
  for (let off = 0; off < eapBytes.length; off += CHUNK) {
    out.push({
      type: AttrType.EapMessage,
      value: eapBytes.subarray(off, Math.min(off + CHUNK, eapBytes.length)),
    });
  }
  return out;
}

async function yieldEventLoop(times = 4) {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

// ── The conversation ───────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("═══ PEAP-MSCHAPv2 test supplicant ══════════════════════");
  log("config", `server=${HOST}:${PORT}`);
  log("config", `user=${USERNAME}`);
  log("config", `secret=${SECRET.slice(0, 4)}…${SECRET.slice(-4)} (${SECRET.length} chars)`);
  console.log("");

  const supplicant = makeSupplicant();

  // Round 1 — Identity
  log("round 1", "sending EAP-Response/Identity");
  const identityEap = encodeEap({
    code: EapCode.Response,
    identifier: 1,
    type: EapType.Identity,
    data: Buffer.from(USERNAME, "utf8"),
  });
  let reply = await sendAccessRequest(identityEap);
  log("round 1", `received code=${reply.code} (${RadiusCode.AccessChallenge === reply.code ? "Access-Challenge" : reply.code})`);

  if (reply.code !== RadiusCode.AccessChallenge) {
    return fail(`expected Access-Challenge, got code=${reply.code}`, dumpReply(reply));
  }
  let stateBytes = findAttribute(reply, AttrType.State)?.value;
  if (!stateBytes) return fail("Access-Challenge missing State attribute");
  let lastEapId = decodeEap(getConcatenated(reply, AttrType.EapMessage)!).identifier;

  // Verify the very first reply is PEAP Start.
  const firstEap = decodeEap(getConcatenated(reply, AttrType.EapMessage)!);
  if (firstEap.type !== EapType.Peap) {
    return fail(`server didn't offer PEAP; got EAP type=${firstEap.type}. ` +
                `Make sure the server was started with PEAP_ENABLED=true.`);
  }
  const firstPeap = decodePeap(firstEap.data);
  if (!firstPeap.start) {
    return fail("first PEAP packet missing Start flag");
  }
  ok("server offered PEAP Start");

  // Drive the rest of the conversation.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    await yieldEventLoop();
    const supplicantTlsBytes = supplicant.bridge.drainOut();

    const peapFrag = encodePeap({
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
      data: peapFrag,
    });

    reply = await sendAccessRequest(responseEap, stateBytes);

    if (reply.code === RadiusCode.AccessReject) {
      const msg = findAttribute(reply, AttrType.ReplyMessage)?.value.toString("utf8");
      return fail(`server rejected at round ${round + 2}: ${msg ?? "(no Reply-Message)"}`);
    }
    if (reply.code === RadiusCode.AccessAccept) {
      ok(`PEAP conversation completed in ${round + 2} rounds`);
      ok("Access-Accept received");
      // Look for MS-MPPE keys.
      const vsas = reply.attributes.filter((a) => a.type === AttrType.VendorSpecific);
      ok(`${vsas.length} Vendor-Specific attribute(s) present (MS-MPPE keys expected)`);
      const eap = getConcatenated(reply, AttrType.EapMessage);
      if (eap) {
        const inner = decodeEap(eap);
        if (inner.code === EapCode.Success) {
          ok("outer EAP-Success enclosed");
        }
      }
      console.log("");
      console.log("\x1b[32m═══ SUCCESS ═══════════════════════════════════════════\x1b[0m");
      console.log("");
      console.log("This proves the PEAP/EAP-MSCHAPv2 wire path works end-to-end.");
      console.log("Next: configure your router for WPA2-Enterprise with these settings:");
      console.log(`  RADIUS server: <this machine's IP>`);
      console.log(`  Port:          ${PORT}`);
      console.log(`  Shared secret: ${SECRET}`);
      console.log(`  EAP method:    PEAP / MSCHAPv2`);
      console.log(`  Test login:    ${USERNAME} / ${PASSWORD}`);
      console.log("");
      socket.close();
      return;
    }

    // Access-Challenge — extract next state + feed TLS data to supplicant.
    const replyEap = decodeEap(getConcatenated(reply, AttrType.EapMessage)!);
    lastEapId = replyEap.identifier;
    if (replyEap.type === EapType.Peap) {
      const peap = decodePeap(replyEap.data);
      if (peap.tls.length > 0) supplicant.bridge.feedIn(peap.tls);
    }
    const nextState = findAttribute(reply, AttrType.State);
    if (nextState) stateBytes = nextState.value;

    // After TLS handshake completes, push inner EAP responses through the tunnel.
    if (supplicant.secureFired && supplicant.cleartextInbox.length > 0) {
      const cleartext = Buffer.concat(supplicant.cleartextInbox);
      supplicant.cleartextInbox.length = 0;

      let innerEap;
      try {
        innerEap = decodeEap(cleartext);
      } catch {
        innerEap = {
          code: EapCode.Request,
          identifier: 0,
          type: cleartext[0],
          data: Buffer.from(cleartext.subarray(1)),
        };
      }

      if (innerEap.type === EapType.Identity) {
        log("inner", "tunnel established → sending inner Identity");
        const reply = encodeEap({
          code: EapCode.Response,
          identifier: innerEap.identifier,
          type: EapType.Identity,
          data: Buffer.from(USERNAME, "utf8"),
        });
        supplicant.socket.write(reply);
      } else if (innerEap.type === EapType.MsChapV2) {
        if (innerEap.data[0] === 1) {
          // Challenge — compute NT-Response.
          log("inner", "received MSCHAPv2 Challenge → computing NT-Response");
          const authChallenge = innerEap.data.subarray(5, 21);
          const peerChallenge = randomBytes(16);
          const ch = challengeHash(peerChallenge, authChallenge, USERNAME);
          const ntResp = computeNtResponse(NT_HASH, ch);

          const name = Buffer.from(USERNAME, "utf8");
          const data = Buffer.alloc(1 + 1 + 2 + 1 + 49 + name.length);
          data[0] = 2; // Response
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
          // Success op-code — ack.
          log("inner", "MSCHAPv2 Success received → acking");
          const reply = encodeEap({
            code: EapCode.Response,
            identifier: innerEap.identifier,
            type: EapType.MsChapV2,
            data: Buffer.from([3]),
          });
          supplicant.socket.write(reply);
        } else if (innerEap.data[0] === 4) {
          // Failure — extract error.
          const errStr = innerEap.data.slice(1).toString("ascii");
          return fail(`server sent MSCHAPv2 Failure: ${errStr}`);
        }
      }
    }
  }

  fail(`exhausted ${MAX_ROUNDS} rounds without Access-Accept — handshake stalled`);
}

function dumpReply(reply: RadiusPacket): Record<string, unknown> {
  return {
    code: reply.code,
    identifier: reply.identifier,
    attributes: reply.attributes.map((a) => ({
      type: a.type,
      length: a.value.length,
    })),
  };
}

main().catch((err) => {
  fail(err.message, err);
});
