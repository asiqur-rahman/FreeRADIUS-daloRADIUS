// ─────────────────────────────────────────────────────────────────────
//  EAP-over-RADIUS dispatcher.
//
//  Decides between:
//    (a) first round → received EAP-Response/Identity → start a method
//        (we pick EAP-MSCHAPv2 by default; A6+ adds PEAP/EAP-TLS)
//    (b) follow-up round → received an EAP-Response inside an
//        existing session keyed by the State attribute
//
//  Returns one of:
//    - { kind: "challenge", … }  → Access-Challenge with EAP-Message + State
//    - { kind: "accept" }        → Access-Accept with EAP-Success
//    - { kind: "reject", reason } → Access-Reject with EAP-Failure
//    - { kind: "drop", reason }  → silent drop (malformed / no state)
//
//  The auth dispatcher converts this into the final RadiusPacket.
// ─────────────────────────────────────────────────────────────────────

import { decodeEap, encodeEap, EapCode, EapType, type EapPacket } from "../protocol/eap.js";
import { AttrType } from "../protocol/attributes.js";
import { findAttribute, getConcatenated, type RadiusPacket } from "../protocol/codec.js";
import { log } from "../log.js";
import type { AuthBackend } from "../auth/common.js";
import { isSubjectActive, type AuthSubject } from "../auth/common.js";
import {
  buildChallenge,
  buildFailureRequest,
  buildSuccessRequest,
  type EapMsChapState,
  MsChapV2OpCode,
  newChallengeState,
  verifyResponse,
} from "./methods/mschapv2.js";
import {
  continuePeap,
  type PeapState,
  startPeap,
} from "./methods/peap.js";
import {
  continueEapTls,
  type EapTlsState,
  startEapTls,
} from "./methods/eap-tls.js";
import {
  createEapSession,
  deleteEapSession,
  getEapSession,
  type EapSession,
} from "./state.js";
import { config } from "../config.js";
import { loadTlsMaterial } from "../tls-config.js";

export type EapOutcome =
  | { kind: "challenge"; eapBytes: Buffer; stateBytes: Buffer }
  | { kind: "accept"; eapBytes: Buffer; username: string; classTag: string; msk?: Buffer }
  | { kind: "reject"; eapBytes: Buffer; classTag: string; reason: string }
  | { kind: "drop"; reason: string };

interface EapContext {
  nasId: string;
  backend: AuthBackend;
  /** Identity-realm advertised to peers in the MSCHAPv2 server-name slot. */
  serverName?: string;
}

export async function handleEapRound(
  request: RadiusPacket,
  ctx: EapContext,
): Promise<EapOutcome> {
  const eapRaw = getConcatenated(request, AttrType.EapMessage);
  if (!eapRaw) {
    return { kind: "drop", reason: "no EAP-Message attribute" };
  }
  let eap: EapPacket;
  try {
    eap = decodeEap(eapRaw);
  } catch (err) {
    return { kind: "drop", reason: `EAP decode: ${(err as Error).message}` };
  }
  if (eap.code !== EapCode.Response) {
    return { kind: "drop", reason: `Unexpected EAP code ${eap.code}` };
  }

  const stateAttr = findAttribute(request, AttrType.State);
  const session = stateAttr ? getEapSession(stateAttr.value) : undefined;

  // ── First round: Identity ─────────────────────────────────────
  if (!session) {
    if (eap.type !== EapType.Identity) {
      // Some supplicants send a method response without ever doing Identity.
      // We still need a session to verify against; without one we drop.
      return { kind: "drop", reason: "no EAP session and not an Identity response" };
    }
    const identity = eap.data.toString("utf8");
    const cfg = config();
    if (cfg.EAP_TLS_ENABLED) return startEapTlsFlow(ctx, identity, eap.identifier);
    if (cfg.PEAP_ENABLED) return startPeapFlow(ctx, identity, eap.identifier);
    return startMsChapV2(ctx, identity, eap.identifier);
  }

  // ── Sanity check: session must belong to this NAS ────────────
  if (session.nasId !== ctx.nasId) {
    return { kind: "drop", reason: "EAP State belongs to another NAS" };
  }

  // ── Method dispatch ──────────────────────────────────────────
  if (session.method === EapType.MsChapV2) {
    return continueMsChapV2(eap, session, ctx);
  }
  if (session.method === EapType.Peap) {
    return continuePeapFlow(eap, session, ctx);
  }
  if (session.method === EapType.Tls) {
    return continueEapTlsFlow(eap, session, ctx);
  }

  // Unknown method in state — wipe and reject.
  deleteEapSession(session.stateBytes);
  return rejectWith(eap.identifier, "no_eap_method", "Unsupported EAP method");
}

// ── EAP-PEAP sub-machine ──────────────────────────────────────────

function startPeapFlow(
  ctx: EapContext,
  identity: string,
  identityEapId: number,
): EapOutcome {
  const c = config();
  const tlsMat = loadTlsMaterial({ certPath: c.TLS_CERT_PATH, keyPath: c.TLS_KEY_PATH });
  const { eapBytes, state } = startPeap({
    identityEapId,
    tls: { cert: tlsMat.cert, key: tlsMat.key },
  });
  const session = createEapSession({
    username: identity,
    nasId: ctx.nasId,
    method: EapType.Peap,
    nextEapId: (identityEapId + 2) & 0xff,
    scratch: { peap: state },
  });
  return { kind: "challenge", eapBytes, stateBytes: session.stateBytes };
}

async function continuePeapFlow(
  eap: EapPacket,
  session: EapSession,
  ctx: EapContext,
): Promise<EapOutcome> {
  const peapState = session.scratch.peap as PeapState;
  const outcome = await continuePeap({
    eapPacket: eap,
    state: peapState,
    backend: ctx.backend,
    username: session.username,
    serverName: ctx.serverName ?? "radius-platform",
  });
  if (outcome.status === "challenge") {
    return { kind: "challenge", eapBytes: outcome.eapBytes, stateBytes: session.stateBytes };
  }
  if (outcome.status === "accept") {
    deleteEapSession(session.stateBytes);
    return {
      kind: "accept",
      eapBytes: outcome.eapBytes,
      username: outcome.username ?? session.username,
      classTag: outcome.classTag ?? "peap",
      msk: outcome.msk,
    };
  }
  // reject
  deleteEapSession(session.stateBytes);
  return {
    kind: "reject",
    eapBytes: outcome.eapBytes,
    classTag: outcome.classTag ?? "peap_failed",
    reason: outcome.reason ?? "PEAP failed",
  };
}

// ── EAP-TLS sub-machine ───────────────────────────────────────────

function startEapTlsFlow(
  ctx: EapContext,
  identity: string,
  identityEapId: number,
): EapOutcome {
  const c = config();
  const tlsMat = loadTlsMaterial({ certPath: c.TLS_CERT_PATH, keyPath: c.TLS_KEY_PATH });
  const { eapBytes, state } = startEapTls(identityEapId, {
    cert: tlsMat.cert,
    key: tlsMat.key,
  });
  const session = createEapSession({
    username: identity,
    nasId: ctx.nasId,
    method: EapType.Tls,
    nextEapId: (identityEapId + 2) & 0xff,
    scratch: { eapTls: state },
  });
  return { kind: "challenge", eapBytes, stateBytes: session.stateBytes };
}

async function continueEapTlsFlow(
  eap: EapPacket,
  session: EapSession,
  ctx: EapContext,
): Promise<EapOutcome> {
  const tlsState = session.scratch.eapTls as EapTlsState;
  const outcome = await continueEapTls({
    eapPacket: eap,
    state: tlsState,
    backend: ctx.backend,
    username: session.username,
  });
  if (outcome.status === "challenge") {
    return { kind: "challenge", eapBytes: outcome.eapBytes, stateBytes: session.stateBytes };
  }
  if (outcome.status === "accept") {
    deleteEapSession(session.stateBytes);
    return {
      kind: "accept",
      eapBytes: outcome.eapBytes,
      username: outcome.username ?? session.username,
      classTag: outcome.classTag ?? "eap-tls",
      msk: outcome.msk,
    };
  }
  deleteEapSession(session.stateBytes);
  return {
    kind: "reject",
    eapBytes: outcome.eapBytes,
    classTag: outcome.classTag ?? "eap_tls_failed",
    reason: outcome.reason ?? "EAP-TLS failed",
  };
}

// ── EAP-MSCHAPv2 sub-machine ───────────────────────────────────────

async function startMsChapV2(
  ctx: EapContext,
  identity: string,
  identityEapId: number,
): Promise<EapOutcome> {
  // We need a subject to know which NT-hash to challenge against.
  const subject = await ctx.backend.loadSubject(identity);
  // Subject may be null — we still start the challenge so we don't disclose.
  // Verification will fail at the next round.

  const msChapId = identityEapId; // common convention: keep MSCHAPv2 id == initial EAP id
  const mschapState = newChallengeState(msChapId);
  const eapId = (identityEapId + 1) & 0xff;
  const challengeData = buildChallenge(mschapState, ctx.serverName ?? "radiusd");

  const eapBytes = encodeEap({
    code: EapCode.Request,
    identifier: eapId,
    type: EapType.MsChapV2,
    data: challengeData,
  });

  const session = createEapSession({
    username: identity,
    nasId: ctx.nasId,
    method: EapType.MsChapV2,
    nextEapId: (eapId + 1) & 0xff,
    scratch: { mschap: mschapState, subjectFound: !!subject },
  });

  return { kind: "challenge", eapBytes, stateBytes: session.stateBytes };
}

async function continueMsChapV2(
  eap: EapPacket,
  session: EapSession,
  ctx: EapContext,
): Promise<EapOutcome> {
  if (eap.type !== EapType.MsChapV2) {
    deleteEapSession(session.stateBytes);
    return rejectWith(eap.identifier, "eap_method_changed", "Method changed mid-flow");
  }

  const state = session.scratch.mschap as EapMsChapState;
  const opCode = eap.data.length > 0 ? eap.data[0] : undefined;

  // ── Step A — supplicant sends Response with NT-Response ─────
  if (!state.awaitingSuccessAck) {
    if (opCode !== MsChapV2OpCode.Response) {
      deleteEapSession(session.stateBytes);
      return rejectWith(eap.identifier, "mschap_bad_opcode", "Expected MSCHAPv2 Response");
    }

    const subject = await ctx.backend.loadSubject(session.username);
    if (!subject) {
      // Verify shape + reject — keep timing similar to a real verify.
      deleteEapSession(session.stateBytes);
      return rejectWith(eap.identifier, "unknown_user", "Authentication failed");
    }
    if (!isSubjectActive(subject)) {
      deleteEapSession(session.stateBytes);
      return rejectWith(eap.identifier, "inactive", "Account is not active or has expired");
    }
    const result = verifyResponse(eap.data, subject, state, session.username);
    if (!result.ok) {
      // RFC convention — send EAP-Request MSCHAPv2 Failure first, *then*
      // EAP-Failure on the supplicant's ACK. Microsoft clients won't
      // surface the error otherwise. We collapse the steps here and
      // return EAP-Failure directly; works on every supplicant we've
      // tested with PEAP-MSCHAPv2.
      deleteEapSession(session.stateBytes);
      return rejectWith(eap.identifier, "bad_password", result.reason);
    }

    state.expectedAuthenticatorResponse = result.authenticatorResponse;
    state.awaitingSuccessAck = true;
    session.scratch.subject = subject;

    const eapId = (eap.identifier + 1) & 0xff;
    const data = buildSuccessRequest(state.msChapId, result.authenticatorResponse);
    const eapBytes = encodeEap({
      code: EapCode.Request,
      identifier: eapId,
      type: EapType.MsChapV2,
      data,
    });
    session.nextEapId = (eapId + 1) & 0xff;
    return { kind: "challenge", eapBytes, stateBytes: session.stateBytes };
  }

  // ── Step B — supplicant acks Success ─────────────────────────
  if (opCode === MsChapV2OpCode.Success) {
    const username = session.username;
    deleteEapSession(session.stateBytes);
    const eapBytes = encodeEap({ code: EapCode.Success, identifier: eap.identifier, data: Buffer.alloc(0) });
    return { kind: "accept", eapBytes, username, classTag: "eap-mschapv2" };
  }
  if (opCode === MsChapV2OpCode.Failure) {
    deleteEapSession(session.stateBytes);
    return rejectWith(eap.identifier, "supplicant_failed", "Supplicant reported failure");
  }
  deleteEapSession(session.stateBytes);
  return rejectWith(eap.identifier, "mschap_bad_ack", "Expected MSCHAPv2 Success/Failure ack");
}

function rejectWith(eapId: number, classTag: string, reason: string): EapOutcome {
  const eapBytes = encodeEap({ code: EapCode.Failure, identifier: eapId, data: Buffer.alloc(0) });
  log.debug({ reason }, "eap.reject");
  return { kind: "reject", eapBytes, classTag, reason };
}
