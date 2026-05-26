// ─────────────────────────────────────────────────────────────────────
//  EAP-TLS method (RFC 5216).
//
//  Same wire framing as PEAP (L/M/S flags + 4-byte total-length field
//  on the first fragment), but the TLS *handshake itself* authenticates
//  the supplicant via client certificate. No inner EAP exchange.
//
//  Flow:
//    1. Server: EAP-Request/EAP-TLS with S=1 (Start)
//    2. Supplicant: ClientHello + Certificate + CertificateVerify …
//       (fragmented over multiple EAP-Response packets)
//    3. Server: ServerHello + Certificate + CertificateRequest + … +
//       ServerHelloDone (fragmented over multiple EAP-Request packets)
//    4. Supplicant: ChangeCipherSpec + Finished
//    5. Server: ChangeCipherSpec + Finished
//    6. Server: EAP-Success (outer), with MS-MPPE keys derived from MSK
//
//  Cert pinning: after handshake we extract the supplicant's leaf cert,
//  compute SHA-256 fingerprint, look it up in user_devices.cert_fingerprint.
//  No match → reject (rejects rogue certs even if they chain to our CA).
// ─────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { decodePeap, encodePeap, PEAP_MTU } from "../../protocol/peap.js";
import { decodeEap, encodeEap, EapCode, EapType, type EapPacket } from "../../protocol/eap.js";
import { log } from "../../log.js";
import type { AuthBackend, AuthSubject } from "../../auth/common.js";
import { isSubjectActive } from "../../auth/common.js";
import {
  createTlsSession,
  deriveMsk,
  flushTlsOutput,
  type TlsConfig,
  type TlsSession,
} from "./peap-tls.js";

export interface EapTlsState {
  tls: TlsSession;
  inboundBuffer: Buffer;
  inboundTotal: number | null;
  outboundQueue: Buffer;
  outboundTotal: number;
  /** True once we've emitted the final empty EAP-Response acknowledging
   *  the supplicant's Finished. The next inbound packet is the trailing
   *  empty PEAP-style ACK; after that we emit EAP-Success. */
  awaitingFinalAck: boolean;
  /** Set true once we've verified the client cert pin. */
  certPinVerified: boolean;
  /** Set once handshake completes; used as a guard for the MSK step. */
  handshakeDone: boolean;
  msk?: Buffer;
}

export interface EapTlsContinueResult {
  status: "challenge" | "accept" | "reject";
  eapBytes: Buffer;
  msk?: Buffer;
  username?: string;
  reason?: string;
  classTag?: string;
}

/** Begin an EAP-TLS exchange — emit the Start packet. */
export function startEapTls(
  identityEapId: number,
  tlsCfg: TlsConfig,
): { eapBytes: Buffer; state: EapTlsState } {
  const tls = createTlsSession({
    cert: tlsCfg.cert,
    key: tlsCfg.key,
    ca: tlsCfg.ca,
    requestClientCert: true, // EAP-TLS requires a client cert
  });
  tls.ready.catch((err) => log.warn({ err: err.message }, "eap-tls.tls_error"));

  const state: EapTlsState = {
    tls,
    inboundBuffer: Buffer.alloc(0),
    inboundTotal: null,
    outboundQueue: Buffer.alloc(0),
    outboundTotal: 0,
    awaitingFinalAck: false,
    certPinVerified: false,
    handshakeDone: false,
  };

  const eapBytes = encodeEap({
    code: EapCode.Request,
    identifier: (identityEapId + 1) & 0xff,
    type: EapType.Tls,
    data: encodePeap({
      version: 0,
      lengthIncluded: false,
      moreFragments: false,
      start: true,
      tls: Buffer.alloc(0),
    }),
  });
  return { eapBytes, state };
}

export interface EapTlsContinueArgs {
  eapPacket: EapPacket;
  state: EapTlsState;
  backend: AuthBackend;
  /** Identity from the very first EAP-Response/Identity round. */
  username: string;
}

/** Drive one round of an in-flight EAP-TLS exchange. */
export async function continueEapTls(args: EapTlsContinueArgs): Promise<EapTlsContinueResult> {
  const { eapPacket, state, backend, username } = args;
  if (eapPacket.type !== EapType.Tls || !eapPacket.data) {
    return reject(eapPacket.identifier, "eap_tls_wrong_type", "Expected EAP-TLS packet");
  }
  const peap = decodePeap(eapPacket.data);

  // Accumulate fragments.
  if (peap.lengthIncluded && peap.totalLength !== undefined) {
    state.inboundTotal = peap.totalLength;
  }
  state.inboundBuffer = Buffer.concat([state.inboundBuffer, peap.tls]);

  // Surface a TLS error the moment we see the next packet.
  if (state.tls.handshakeError) {
    return reject(eapPacket.identifier, "tls_error", state.tls.handshakeError.message);
  }

  if (peap.moreFragments) {
    return {
      status: "challenge",
      eapBytes: encodeEap({
        code: EapCode.Request,
        identifier: (eapPacket.identifier + 1) & 0xff,
        type: EapType.Tls,
        data: encodePeap({
          version: 0,
          lengthIncluded: false,
          moreFragments: false,
          start: false,
          tls: Buffer.alloc(0),
        }),
      }),
    };
  }

  if (state.inboundBuffer.length > 0) {
    state.tls.bridge.feedIn(state.inboundBuffer);
    state.inboundBuffer = Buffer.alloc(0);
    state.inboundTotal = null;
  }

  const tlsOut = await flushTlsOutput(state.tls);

  // Re-check after the flush (TS narrowing makes the same property look
  // like `never` without the explicit type assertion).
  const hsErr = state.tls.handshakeError as Error | null;
  if (hsErr) {
    return reject(eapPacket.identifier, "tls_error", hsErr.message);
  }

  // Check handshake state — use the authoritative `secure`-event flag.
  if (state.tls.handshakeComplete && !state.handshakeDone) {
    state.handshakeDone = true;
    // Verify the client cert fingerprint pin.
    const peerCert = state.tls.socket.getPeerCertificate(true);
    if (!peerCert || Object.keys(peerCert).length === 0) {
      return reject(eapPacket.identifier, "no_client_cert", "Client cert missing");
    }
    // Node's getPeerCertificate returns DER as a Buffer in `raw`.
    const raw: Buffer | undefined = (peerCert as unknown as { raw?: Buffer }).raw;
    if (!raw) {
      return reject(eapPacket.identifier, "no_client_cert", "Cannot read client cert DER");
    }
    const fingerprint = createHash("sha256").update(raw).digest("hex");
    if (!(await pinMatches(username, fingerprint, backend))) {
      return reject(
        eapPacket.identifier,
        "cert_pin_mismatch",
        "Client certificate does not match any registered device",
      );
    }
    state.certPinVerified = true;
  }

  // If we have nothing left to send AND the handshake is done, the
  // exchange is over — emit EAP-Success + MSK.
  if (state.handshakeDone && tlsOut.length === 0 && state.outboundQueue.length === 0) {
    state.msk = deriveMsk(state.tls);
    return {
      status: "accept",
      eapBytes: encodeEap({
        code: EapCode.Success,
        identifier: eapPacket.identifier,
        data: Buffer.alloc(0),
      }),
      msk: state.msk,
      username,
      classTag: "eap-tls",
    };
  }

  // Otherwise, chunk the TLS output into the next PEAP-style fragment.
  return outgoingFragment(state, tlsOut, eapPacket.identifier);
}

async function pinMatches(
  username: string,
  fingerprint: string,
  backend: AuthBackend,
): Promise<boolean> {
  // The AuthBackend in A2 only loads users; for cert pinning we need
  // device lookup. We extend the backend via a small adapter — apps/api
  // wires a real implementation, tests inject in-memory.
  const subject = await backend.loadSubject(username);
  if (!subject) return false;
  if (!isSubjectActive(subject)) return false;
  const lookup = (backend as AuthBackend & {
    findDeviceByFingerprint?: (userId: string, fp: string) => Promise<boolean>;
  }).findDeviceByFingerprint;
  if (!lookup) {
    log.warn(
      "eap-tls.pin_check_no_backend — AuthBackend does not implement findDeviceByFingerprint; " +
        "rejecting by default. Wire prismaAuthBackend.findDeviceByFingerprint to enable EAP-TLS.",
    );
    return false;
  }
  return lookup(subject.user.id, fingerprint);
}

function outgoingFragment(
  state: EapTlsState,
  fresh: Buffer,
  inboundEapId: number,
): EapTlsContinueResult {
  if (fresh.length > 0) {
    if (state.outboundQueue.length === 0) {
      state.outboundTotal = fresh.length;
    } else {
      state.outboundTotal += fresh.length;
    }
    state.outboundQueue = Buffer.concat([state.outboundQueue, fresh]);
  }

  if (state.outboundQueue.length === 0) {
    // Empty ACK — supplicant probably acknowledged our last fragment.
    return {
      status: "challenge",
      eapBytes: encodeEap({
        code: EapCode.Request,
        identifier: (inboundEapId + 1) & 0xff,
        type: EapType.Tls,
        data: encodePeap({
          version: 0,
          lengthIncluded: false,
          moreFragments: false,
          start: false,
          tls: Buffer.alloc(0),
        }),
      }),
    };
  }

  const isFirstFragment = state.outboundQueue.length === state.outboundTotal;
  const sliceLen = Math.min(state.outboundQueue.length, PEAP_MTU);
  const slice = Buffer.from(state.outboundQueue.subarray(0, sliceLen));
  state.outboundQueue = Buffer.from(state.outboundQueue.subarray(sliceLen));
  const more = state.outboundQueue.length > 0;

  return {
    status: "challenge",
    eapBytes: encodeEap({
      code: EapCode.Request,
      identifier: (inboundEapId + 1) & 0xff,
      type: EapType.Tls,
      data: encodePeap({
        version: 0,
        lengthIncluded: isFirstFragment,
        moreFragments: more,
        start: false,
        totalLength: isFirstFragment ? state.outboundTotal : undefined,
        tls: slice,
      }),
    }),
  };
}

function reject(eapId: number, classTag: string, reason: string): EapTlsContinueResult {
  return {
    status: "reject",
    eapBytes: encodeEap({
      code: EapCode.Failure,
      identifier: eapId,
      data: Buffer.alloc(0),
    }),
    classTag,
    reason,
  };
}
