// ─────────────────────────────────────────────────────────────────────
//  Access-Request dispatcher.
//
//  Picks an auth method based on which attributes the NAS supplied, in
//  this order of preference:
//
//    1. MS-CHAP2-Response   → MSCHAPv2
//    2. CHAP-Password       → CHAP (always rejected — no plaintext store)
//    3. User-Password       → PAP
//    4. (none)              → reject "no auth attribute"
//
//  Every outcome (accept or reject) flows through this module so that
//  radpostauth logging happens exactly once per request.
// ─────────────────────────────────────────────────────────────────────

import { AttrType, MESSAGE_AUTHENTICATOR_VALUE_LENGTH } from "../protocol/attributes.js";
import {
  findAttribute,
  getString,
  octetsAttribute,
  stringAttribute,
  RADIUS_AUTHENTICATOR_LENGTH,
  type RadiusAttribute,
  type RadiusPacket,
} from "../protocol/codec.js";
import { RadiusCode } from "../protocol/codes.js";
import { findVsa, VendorId, vendorAttribute } from "../protocol/vendor.js";
import { MicrosoftVsa } from "../protocol/mschap.js";
import { chunkForEapMessage } from "../protocol/eap.js";

import { log } from "../log.js";
import type { NasIdentity } from "../nas.js";

import { authenticatePap } from "./pap.js";
import { authenticateMsChapV2 } from "./mschapv2.js";
import { CHAP_UNSUPPORTED } from "./chap.js";
import type { AuthBackend } from "./common.js";
import { handleEapRound, type EapOutcome } from "../eap/dispatch.js";
import { mppeRecvKey, mppeSendKey } from "../eap/methods/mppe.js";

interface DispatchContext {
  nas: NasIdentity;
  backend: AuthBackend;
}

export async function handleAccessRequest(
  request: RadiusPacket,
  ctx: DispatchContext,
): Promise<RadiusPacket> {
  const rawUsername = getString(request, AttrType.UserName) ?? "";
  const callingStationId = getString(request, AttrType.CallingStationId) ?? null;
  const calledStationId = getString(request, AttrType.CalledStationId) ?? null;

  // No User-Name → reject before we even hit the DB.
  if (!rawUsername) {
    await ctx.backend.logPostAuth({
      username: "",
      reply: "Access-Reject",
      class: "no_username",
      callingStationId,
      calledStationId,
    });
    return reject("Missing User-Name");
  }

  const subject = await ctx.backend.loadSubject(rawUsername);
  if (!subject) {
    // Diagnostic: log the raw bytes of the User-Name attribute so we
    // can spot NUL terminators, trailing whitespace, encoding weirdness
    // that don't show up in psql output. Cheap; only fires on rejects.
    const rawBytes = Buffer.from(rawUsername, "utf8").toString("hex");
    log.warn(
      { rawUsername, rawBytes, length: rawUsername.length },
      "auth.unknown_user",
    );
    // Don't disclose whether the user exists — same response either way.
    await ctx.backend.logPostAuth({
      username: rawUsername,
      reply: "Access-Reject",
      class: "unknown_user",
      callingStationId,
      calledStationId,
    });
    return reject("Authentication failed");
  }

  // ── EAP takes priority over every direct method ──────────────
  // If the NAS includes any EAP-Message attribute, we MUST handle EAP
  // (RFC 3579 §2.6.1). Other auth attributes are ignored.
  const hasEap = request.attributes.some((a) => a.type === AttrType.EapMessage);
  if (hasEap) {
    const outcome = await handleEapRound(request, {
      nasId: ctx.nas.id,
      backend: ctx.backend,
    });
    return await renderEapOutcome(
      outcome,
      rawUsername,
      callingStationId,
      calledStationId,
      ctx,
      request.authenticator,
    );
  }

  const ms2 = findVsa(request, VendorId.Microsoft, MicrosoftVsa.MsChap2Response);
  const chapPwd = findAttribute(request, AttrType.ChapPassword);
  const userPwd = findAttribute(request, AttrType.UserPassword);

  // ── MSCHAPv2 ───────────────────────────────────────────────────
  if (ms2) {
    const challenge = findVsa(request, VendorId.Microsoft, MicrosoftVsa.MsChapChallenge);
    if (!challenge) {
      await ctx.backend.logPostAuth({
        username: rawUsername,
        reply: "Access-Reject",
        class: "no_ms_chap_challenge",
        callingStationId,
        calledStationId,
      });
      return reject("MS-CHAP-Challenge missing");
    }
    const outcome = authenticateMsChapV2({
      authChallenge: challenge,
      responseRaw: ms2,
      rawUsername,
      subject,
    });
    if (!outcome.ok) {
      await ctx.backend.logPostAuth({
        username: rawUsername,
        reply: "Access-Reject",
        class: outcome.classTag,
        callingStationId,
        calledStationId,
      });
      return reject(outcome.reason);
    }
    await ctx.backend.logPostAuth({
      username: subject.user.username,
      reply: "Access-Accept",
      class: "mschapv2",
      callingStationId,
      calledStationId,
    });
    return accept([
      vendorAttribute(VendorId.Microsoft, MicrosoftVsa.MsChap2Success, outcome.successMessage),
    ]);
  }

  // ── CHAP ───────────────────────────────────────────────────────
  if (chapPwd) {
    await ctx.backend.logPostAuth({
      username: rawUsername,
      reply: "Access-Reject",
      class: CHAP_UNSUPPORTED.classTag,
      callingStationId,
      calledStationId,
    });
    return reject(CHAP_UNSUPPORTED.reason);
  }

  // ── PAP ────────────────────────────────────────────────────────
  if (userPwd) {
    const outcome = await authenticatePap({
      cipher: userPwd.value,
      requestAuthenticator: request.authenticator,
      secret: ctx.nas.secret,
      subject,
    });
    if (!outcome.ok) {
      await ctx.backend.logPostAuth({
        username: rawUsername,
        reply: "Access-Reject",
        class: outcome.classTag,
        callingStationId,
        calledStationId,
      });
      return reject(outcome.reason);
    }
    await ctx.backend.logPostAuth({
      username: subject.user.username,
      reply: "Access-Accept",
      class: "pap",
      callingStationId,
      calledStationId,
    });
    return accept();
  }

  // ── Nothing usable ─────────────────────────────────────────────
  log.debug({ user: rawUsername, nas: ctx.nas.shortname }, "auth.no_method_attribute");
  await ctx.backend.logPostAuth({
    username: rawUsername,
    reply: "Access-Reject",
    class: "no_auth_method",
    callingStationId,
    calledStationId,
  });
  return reject("No supported authentication method present");
}

// ── Response constructors ──────────────────────────────────────────

function placeholderAuthenticator(): Buffer {
  // The server-side response builder fills this in via
  // computeResponseAuthenticator. The encoder requires exactly 16 bytes.
  return Buffer.alloc(RADIUS_AUTHENTICATOR_LENGTH);
}

function accept(extraAttributes: RadiusAttribute[] = []): RadiusPacket {
  return {
    code: RadiusCode.AccessAccept,
    identifier: 0, // overwritten by server.ts (uses request.identifier)
    authenticator: placeholderAuthenticator(),
    attributes: extraAttributes,
  };
}

function reject(message: string): RadiusPacket {
  const trimmed = message.length > 200 ? `${message.slice(0, 197)}...` : message;
  return {
    code: RadiusCode.AccessReject,
    identifier: 0,
    authenticator: placeholderAuthenticator(),
    attributes: [stringAttribute(AttrType.ReplyMessage, trimmed)],
  };
}

// Helper for the optional "Class" attribute echo on PAP/MSCHAPv2 accept paths,
// kept here so tests can import it cleanly when we add accounting in A3.
export function classAttribute(label: string): RadiusAttribute {
  return octetsAttribute(AttrType.Class, Buffer.from(label, "utf8"));
}

// ── EAP outcome → RadiusPacket renderer ────────────────────────────

async function renderEapOutcome(
  outcome: EapOutcome,
  rawUsername: string,
  callingStationId: string | null,
  calledStationId: string | null,
  ctx: DispatchContext,
  requestAuthenticator: Buffer,
): Promise<RadiusPacket> {
  if (outcome.kind === "drop") {
    log.warn({ reason: outcome.reason, user: rawUsername }, "eap.drop");
    await ctx.backend.logPostAuth({
      username: rawUsername,
      reply: "Access-Reject",
      class: "eap_drop",
      callingStationId,
      calledStationId,
    });
    // We have to reply with *something* — a NAK with no body — because
    // RADIUS doesn't have a "no response" semantic for AccessRequest.
    return rejectWithEapBytes(emptyEapFailure(), rawUsername);
  }

  // Every EAP response packet MUST include a Message-Authenticator
  // attribute (RFC 3579 §3.2). The server signing step fills the value.
  const msgAuthPlaceholder = msgAuthZero();

  if (outcome.kind === "challenge") {
    return {
      code: RadiusCode.AccessChallenge,
      identifier: 0,
      authenticator: placeholderAuthenticator(),
      attributes: [
        ...eapMessageAttributes(outcome.eapBytes),
        octetsAttribute(AttrType.State, outcome.stateBytes),
        msgAuthPlaceholder,
      ],
    };
  }

  if (outcome.kind === "accept") {
    await ctx.backend.logPostAuth({
      username: outcome.username,
      reply: "Access-Accept",
      class: outcome.classTag,
      callingStationId,
      calledStationId,
    });
    // If the EAP method derived a Master Session Key (PEAP / EAP-TLS),
    // ship it to the NAS as MS-MPPE-Recv-Key + MS-MPPE-Send-Key VSAs.
    // The first 32 bytes go to Recv-Key, the next 32 to Send-Key —
    // matches what Microsoft NPS and FreeRADIUS emit.
    const mppeAttrs: RadiusAttribute[] = [];
    if (outcome.msk && outcome.msk.length >= 64) {
      mppeAttrs.push(
        mppeRecvKey(outcome.msk.subarray(0, 32), ctx.nas.secret, requestAuthenticator),
        mppeSendKey(outcome.msk.subarray(32, 64), ctx.nas.secret, requestAuthenticator),
      );
    }
    return {
      code: RadiusCode.AccessAccept,
      identifier: 0,
      authenticator: placeholderAuthenticator(),
      attributes: [
        ...eapMessageAttributes(outcome.eapBytes),
        ...mppeAttrs,
        msgAuthPlaceholder,
      ],
    };
  }

  // reject
  await ctx.backend.logPostAuth({
    username: rawUsername,
    reply: "Access-Reject",
    class: outcome.classTag,
    callingStationId,
    calledStationId,
  });
  return {
    code: RadiusCode.AccessReject,
    identifier: 0,
    authenticator: placeholderAuthenticator(),
    attributes: [...eapMessageAttributes(outcome.eapBytes), msgAuthPlaceholder],
  };
}

function eapMessageAttributes(eapBytes: Buffer): RadiusAttribute[] {
  return chunkForEapMessage(eapBytes).map((chunk) => ({
    type: AttrType.EapMessage,
    value: chunk,
  }));
}

function msgAuthZero(): RadiusAttribute {
  return octetsAttribute(AttrType.MessageAuthenticator, Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH));
}

function emptyEapFailure(): Buffer {
  // Smallest possible failure indication for the drop fallback.
  return Buffer.from([4, 0, 0, 4]); // EAP-Failure, id=0, length=4
}

function rejectWithEapBytes(eapBytes: Buffer, _username: string): RadiusPacket {
  return {
    code: RadiusCode.AccessReject,
    identifier: 0,
    authenticator: placeholderAuthenticator(),
    attributes: [...eapMessageAttributes(eapBytes), msgAuthZero()],
  };
}
