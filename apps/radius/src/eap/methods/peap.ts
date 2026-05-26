// ─────────────────────────────────────────────────────────────────────
//  EAP-PEAP method handler (draft-josefsson-pppext-eap-tls-eap).
//
//  PEAP flow at a glance:
//
//    1. Server sends EAP-Request/PEAP with S=1 (Start), no TLS data.
//    2. Supplicant sends ClientHello (TLS handshake record), the
//       server replies with ServerHello/Cert/etc. — possibly across
//       multiple PEAP fragments using L= + M= flags.
//    3. Once TLSSocket emits 'secure', the TLS tunnel is up.
//    4. Inner EAP exchange runs through the tunnel. We default to
//       EAP-MSCHAPv2 inside; supplicants negotiate via EAP-Nak if
//       they prefer a different inner method.
//    5. On inner success, server derives MSK via TLS exporter and
//       sends EAP-Success (outer), wrapping MS-MPPE keys in the
//       Access-Accept.
//
//  Limitations of this initial implementation:
//   - PEAPv0 only (most common in the wild — Windows, macOS, Android,
//     iOS, wpa_supplicant all default to v0).
//   - Inner method limited to EAP-MSCHAPv2.
//   - No fast-reconnect / session caching.
//   - Cryptobinding TLVs (PEAPv2) not emitted.
//
//  These limits are explicitly called out as "A6.x follow-ups" in the
//  roadmap — they're polish, not correctness blockers.
// ─────────────────────────────────────────────────────────────────────

import { decodePeap, encodePeap, PEAP_MTU } from "../../protocol/peap.js";
import { decodeEap, encodeEap, EapCode, EapType, type EapPacket } from "../../protocol/eap.js";
import { log } from "../../log.js";
import type { AuthBackend, AuthSubject } from "../../auth/common.js";
import { isSubjectActive } from "../../auth/common.js";
import {
  challengeHash,
  computeNtResponse,
  generateAuthenticatorResponse,
  randomChallenge,
  verifyNtResponse,
} from "../../protocol/mschap.js";
import {
  createTlsSession,
  deriveMsk,
  flushTlsOutput,
  takeCleartext,
  type TlsConfig,
  type TlsSession,
} from "./peap-tls.js";

// ── Per-session PEAP scratch ──────────────────────────────────────

/** State machine of the inner phase. */
type InnerPhase =
  | { kind: "expect-identity" }
  | { kind: "sent-challenge"; authChallenge: Buffer; msChapId: number }
  | { kind: "sent-mschap-success"; authResp: Buffer }
  | { kind: "done" };

export interface PeapState {
  tls: TlsSession;
  /** PEAP version we'll echo back. Locked to whatever the supplicant
   *  sent on its first non-Start packet. */
  version: number;
  /** Inbound fragments accumulating into a full TLS message. */
  inboundBuffer: Buffer;
  /** Total length signalled by L=1 on the first fragment; null if none seen. */
  inboundTotal: number | null;
  /** Outbound TLS bytes waiting to be chunked into PEAP fragments. */
  outboundQueue: Buffer;
  /** Outbound message total length (for L=1 on the first fragment). */
  outboundTotal: number;
  innerPhase: InnerPhase;
  /** Most recent inner-EAP identifier we sent. */
  innerEapId: number;
  /** Cached for the success-keys path. */
  subject?: AuthSubject;
  /** Set after inner method completes successfully. */
  msk?: Buffer;
}

export interface PeapOutcome {
  /** Outer EAP packet to send to the supplicant. */
  eapBytes: Buffer;
  /** Whether the outer Access-* should be Challenge / Accept / Reject. */
  status: "challenge" | "accept" | "reject";
  /** Present on accept; the 64-byte keying material for MS-MPPE keys. */
  msk?: Buffer;
  username?: string;
  classTag?: string;
  reason?: string;
}

// ── Public entry points ───────────────────────────────────────────

export interface PeapStartArgs {
  identityEapId: number;
  tls: TlsConfig;
}

/**
 * Begin a PEAP exchange. Returns the initial EAP-Request/PEAP with S=1
 * and the state to stash in the EapSession.
 */
export function startPeap(args: PeapStartArgs): { eapBytes: Buffer; state: PeapState } {
  const tls = createTlsSession({
    cert: args.tls.cert,
    key: args.tls.key,
    ca: args.tls.ca,
    requestClientCert: false,
  });
  // Swallow async TLS errors so they don't crash the process — we
  // surface them by sending EAP-Failure on the next round.
  tls.ready.catch((err) => log.warn({ err: err.message }, "peap.tls_error"));

  const state: PeapState = {
    tls,
    version: 0, // we offer v0; supplicant may downgrade-confirm or echo
    inboundBuffer: Buffer.alloc(0),
    inboundTotal: null,
    outboundQueue: Buffer.alloc(0),
    outboundTotal: 0,
    innerPhase: { kind: "expect-identity" },
    innerEapId: (args.identityEapId + 1) & 0xff,
  };

  const startBytes = encodeEap({
    code: EapCode.Request,
    identifier: (args.identityEapId + 1) & 0xff,
    type: EapType.Peap,
    data: encodePeap({
      version: 0,
      lengthIncluded: false,
      moreFragments: false,
      start: true,
      tls: Buffer.alloc(0),
    }),
  });
  return { eapBytes: startBytes, state };
}

export interface PeapContinueArgs {
  eapPacket: EapPacket;
  state: PeapState;
  backend: AuthBackend;
  username: string;
  serverName: string;
}

/**
 * Continue an in-flight PEAP exchange given the next EAP-Response from
 * the supplicant. Drives the TLS handshake and (after it completes)
 * the inner EAP-MSCHAPv2 exchange.
 */
export async function continuePeap(args: PeapContinueArgs): Promise<PeapOutcome> {
  const { eapPacket, state } = args;
  if (eapPacket.type !== EapType.Peap || !eapPacket.data) {
    return reject(eapPacket.identifier, "peap_wrong_type", "Expected PEAP EAP packet");
  }

  const peap = decodePeap(eapPacket.data);

  // Lock onto whatever PEAP version the supplicant uses on its first
  // non-Start packet. Most clients negotiate down to v0, but iOS/macOS
  // sometimes offer v1; echoing back what we received avoids tear-down.
  if (peap.version !== state.version) {
    state.version = peap.version;
  }

  // Surface TLS errors from earlier rounds the moment we see the next packet.
  if (state.tls.handshakeError) {
    return reject(eapPacket.identifier, "tls_error", state.tls.handshakeError.message);
  }

  // ── Accumulate inbound fragment ──────────────────────────────
  if (peap.lengthIncluded && peap.totalLength !== undefined) {
    state.inboundTotal = peap.totalLength;
  }
  state.inboundBuffer = Buffer.concat([state.inboundBuffer, peap.tls]);

  // If supplicant says "more fragments coming", reply with an empty PEAP ACK.
  if (peap.moreFragments) {
    const ack = encodePeap({
      version: state.version,
      lengthIncluded: false,
      moreFragments: false,
      start: false,
      tls: Buffer.alloc(0),
    });
    return {
      status: "challenge",
      eapBytes: encodeEap({
        code: EapCode.Request,
        identifier: (eapPacket.identifier + 1) & 0xff,
        type: EapType.Peap,
        data: ack,
      }),
    };
  }

  // Full TLS message assembled — push it into the TLS state machine.
  if (state.inboundBuffer.length > 0) {
    state.tls.bridge.feedIn(state.inboundBuffer);
    state.inboundBuffer = Buffer.alloc(0);
    state.inboundTotal = null;
  }

  // Let TLS process. If the handshake is complete and we're past the
  // first round, this delivers inner-EAP cleartext to the bridge.
  const tlsOut = await flushTlsOutput(state.tls);

  // Surface a handshake error that happened during the last flush.
  // (re-check — `flushTlsOutput` may have set this since the earlier guard)
  const hsErr = state.tls.handshakeError as Error | null;
  if (hsErr) {
    return reject(eapPacket.identifier, "tls_error", hsErr.message);
  }

  // ── Post-handshake: drive the inner EAP exchange ─────────────
  if (state.tls.handshakeComplete) {
    const innerCleartext = takeCleartext(state.tls);
    if (innerCleartext.length > 0) {
      return await handleInnerEap(innerCleartext, args, tlsOut);
    }
    if (state.innerPhase.kind === "expect-identity") {
      // Tunnel established, but supplicant hasn't sent inner Identity yet —
      // send an inner EAP-Request/Identity to prompt it.
      const innerRequest = encodeEap({
        code: EapCode.Request,
        identifier: state.innerEapId,
        type: EapType.Identity,
        data: Buffer.alloc(0),
      });
      state.tls.socket.write(innerRequest);
      const moreOut = await flushTlsOutput(state.tls);
      return outgoingPeapFragment(state, Buffer.concat([tlsOut, moreOut]), eapPacket.identifier);
    }
  }

  // ── Handshake still in flight — chunk the TLS output as a PEAP frag ──
  return outgoingPeapFragment(state, tlsOut, eapPacket.identifier);
}

// Removed: the old isHandshakeDone() heuristic. We now key off
// `state.tls.handshakeComplete`, set synchronously in the 'secure'
// event handler — reliable across Node versions.

// ── Inner EAP exchange (PEAPv0, EAP-MSCHAPv2 only) ────────────────

async function handleInnerEap(
  cleartext: Buffer,
  args: PeapContinueArgs,
  pendingTlsOut: Buffer,
): Promise<PeapOutcome> {
  const { state, backend, username } = args;

  // PEAPv0 omits the outer EAP header on inner packets in some
  // dialects. Try to decode as a full EAP packet first; fall back to
  // "type + data" if the length looks wrong.
  let inner: EapPacket;
  try {
    inner = decodeEap(cleartext);
  } catch {
    // Treat as bare "type | data".
    inner = {
      code: EapCode.Response,
      identifier: state.innerEapId,
      type: cleartext[0],
      data: Buffer.from(cleartext.subarray(1)),
    };
  }

  // Phase A — supplicant sends inner Identity → respond with MSCHAPv2 Challenge.
  if (state.innerPhase.kind === "expect-identity") {
    if (inner.type !== EapType.Identity) {
      return innerReject(state, args.eapPacket.identifier, "expected inner Identity");
    }
    const authChallenge = randomChallenge();
    const msChapId = inner.identifier & 0xff;
    const data = buildMsChapV2Challenge(authChallenge, args.serverName, msChapId);
    const innerReq = encodeEap({
      code: EapCode.Request,
      identifier: (inner.identifier + 1) & 0xff,
      type: EapType.MsChapV2,
      data,
    });
    state.innerPhase = { kind: "sent-challenge", authChallenge, msChapId };
    state.innerEapId = (inner.identifier + 1) & 0xff;
    state.tls.socket.write(innerReq);
    const moreOut = await flushTlsOutput(state.tls);
    return outgoingPeapFragment(
      state,
      Buffer.concat([pendingTlsOut, moreOut]),
      args.eapPacket.identifier,
    );
  }

  // Phase B — supplicant responds with NT-Response → verify.
  if (state.innerPhase.kind === "sent-challenge") {
    const subject = await backend.loadSubject(username);
    if (!subject || !isSubjectActive(subject)) {
      return innerReject(state, args.eapPacket.identifier, "user inactive or unknown");
    }
    state.subject = subject;

    // Parse Response payload (we expect type=MSCHAPv2).
    const data = inner.data;
    if (data.length < 1 + 1 + 2 + 1 + 49) {
      return innerReject(state, args.eapPacket.identifier, "MSCHAPv2 Response too short");
    }
    const peerCh = data.subarray(5, 21);
    const ntResp = data.subarray(29, 53);
    const ntHash = Buffer.from(subject.secret.ntHash, "hex");
    const chHash = challengeHash(peerCh, state.innerPhase.authChallenge, username);
    const expected = computeNtResponse(ntHash, chHash);
    if (!verifyNtResponse(expected, ntResp)) {
      return innerReject(state, args.eapPacket.identifier, "bad NT-Response");
    }
    const authResp = generateAuthenticatorResponse(
      ntHash,
      ntResp,
      peerCh,
      state.innerPhase.authChallenge,
      username,
    );

    // Send inner MSCHAPv2 Success.
    const successData = Buffer.concat([
      Buffer.from([3]), // OpCode.Success
      Buffer.from(`S=${authResp.toString("hex").toUpperCase()} M=OK`, "ascii"),
    ]);
    const innerReq = encodeEap({
      code: EapCode.Request,
      identifier: (inner.identifier + 1) & 0xff,
      type: EapType.MsChapV2,
      data: successData,
    });
    state.innerPhase = { kind: "sent-mschap-success", authResp };
    state.innerEapId = (inner.identifier + 1) & 0xff;
    state.tls.socket.write(innerReq);
    const moreOut = await flushTlsOutput(state.tls);
    return outgoingPeapFragment(
      state,
      Buffer.concat([pendingTlsOut, moreOut]),
      args.eapPacket.identifier,
    );
  }

  // Phase C — supplicant acks inner success → derive MSK, send outer EAP-Success.
  if (state.innerPhase.kind === "sent-mschap-success") {
    // Expecting MSCHAPv2 Success op-code from supplicant.
    state.innerPhase = { kind: "done" };
    state.msk = deriveMsk(state.tls);
    const outerSuccess = encodeEap({
      code: EapCode.Success,
      identifier: args.eapPacket.identifier,
      data: Buffer.alloc(0),
    });
    return {
      status: "accept",
      eapBytes: outerSuccess,
      msk: state.msk,
      username,
      classTag: "peap-mschapv2",
    };
  }

  return innerReject(state, args.eapPacket.identifier, "inner state corrupt");
}

function buildMsChapV2Challenge(authChallenge: Buffer, serverName: string, msChapId: number): Buffer {
  const name = Buffer.from(serverName, "utf8");
  const data = Buffer.alloc(1 + 1 + 2 + 1 + 16 + name.length);
  data[0] = 1; // OpCode.Challenge
  data[1] = msChapId;
  data.writeUInt16BE(data.length, 2);
  data[4] = 16; // value-size
  authChallenge.copy(data, 5);
  name.copy(data, 21);
  return data;
}

function innerReject(state: PeapState, eapId: number, reason: string): PeapOutcome {
  log.debug({ reason }, "peap.inner_reject");
  state.innerPhase = { kind: "done" };
  return reject(eapId, "peap_inner_failed", reason);
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Take a chunk of outbound TLS bytes and wrap them into the next PEAP
 * fragment. If they exceed PEAP_MTU we set the M-bit and stash the
 * remainder for the supplicant's next ACK packet.
 */
function outgoingPeapFragment(
  state: PeapState,
  fresh: Buffer,
  inboundEapId: number,
): PeapOutcome {
  if (fresh.length > 0) {
    if (state.outboundQueue.length === 0) {
      state.outboundTotal = fresh.length;
    } else {
      state.outboundTotal += fresh.length;
    }
    state.outboundQueue = Buffer.concat([state.outboundQueue, fresh]);
  }

  if (state.outboundQueue.length === 0) {
    // Nothing pending — supplicant probably ACKed our final fragment.
    // Send an empty PEAP packet (acts as a probe).
    const empty = encodePeap({
      version: state.version,
      lengthIncluded: false,
      moreFragments: false,
      start: false,
      tls: Buffer.alloc(0),
    });
    return {
      status: "challenge",
      eapBytes: encodeEap({
        code: EapCode.Request,
        identifier: (inboundEapId + 1) & 0xff,
        type: EapType.Peap,
        data: empty,
      }),
    };
  }

  const isFirstFragment = state.outboundQueue.length === state.outboundTotal;
  const sliceLen = Math.min(state.outboundQueue.length, PEAP_MTU);
  const slice = state.outboundQueue.subarray(0, sliceLen);
  const remaining = state.outboundQueue.subarray(sliceLen);
  state.outboundQueue = Buffer.from(remaining);
  const more = remaining.length > 0;

  const peapBytes = encodePeap({
    version: state.version,
    lengthIncluded: isFirstFragment,
    moreFragments: more,
    start: false,
    totalLength: isFirstFragment ? state.outboundTotal : undefined,
    tls: Buffer.from(slice),
  });
  return {
    status: "challenge",
    eapBytes: encodeEap({
      code: EapCode.Request,
      identifier: (inboundEapId + 1) & 0xff,
      type: EapType.Peap,
      data: peapBytes,
    }),
  };
}

function reject(eapId: number, classTag: string, reason: string): PeapOutcome {
  const eapBytes = encodeEap({
    code: EapCode.Failure,
    identifier: eapId,
    data: Buffer.alloc(0),
  });
  return { status: "reject", eapBytes, classTag, reason };
}
