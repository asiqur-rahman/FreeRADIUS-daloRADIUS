// ─────────────────────────────────────────────────────────────────────
//  Accounting-Request dispatcher.
//
//  Pipeline per packet:
//    1. Parse into AccountingRequest (octets, gigawords, enums).
//    2. Route by Acct-Status-Type:
//         Start / Interim / Stop  → upsertSession
//         Accounting-On / -Off    → closeNasSessions (NAS reboot signal)
//         anything else           → log + return ACK anyway
//    3. Return Accounting-Response (code 5, no attributes) — the
//       caller signs it with the standard Response Authenticator.
//
//  We *always* reply ACK, even on persistence failure. The alternative
//  (silent drop) causes the NAS to retry forever and overwhelms the
//  link; a brief reporting gap is the lesser evil.
// ─────────────────────────────────────────────────────────────────────

import { log } from "../log.js";
import { type RadiusPacket } from "../protocol/codec.js";
import { RadiusCode } from "../protocol/codes.js";
import type { NasIdentity } from "../nas.js";
import type { AcctBackend } from "./persistence.js";
import { AcctStatusType, parseAccountingRequest } from "./parse.js";

interface AcctContext {
  nas: NasIdentity;
  peerAddress: string;
  backend: AcctBackend;
}

export async function handleAccountingRequest(
  request: RadiusPacket,
  ctx: AcctContext,
): Promise<RadiusPacket> {
  const parsed = parseAccountingRequest(request, ctx.peerAddress);

  switch (parsed.statusType) {
    case AcctStatusType.Start:
    case AcctStatusType.InterimUpdate:
    case AcctStatusType.Stop: {
      // Sessions without a session-id can't be reliably correlated;
      // accept the packet so the NAS stops retrying, but skip the write.
      if (!parsed.sessionId) {
        log.warn(
          { nas: ctx.nas.shortname, statusType: parsed.statusType },
          "acct.missing_session_id",
        );
        return accountingResponse(request.identifier);
      }
      await ctx.backend.upsertSession(parsed);
      log.info(
        {
          nas: ctx.nas.shortname,
          user: parsed.username,
          sessionId: parsed.sessionId,
          status: ["?", "Start", "Stop", "Interim"][parsed.statusType] ?? String(parsed.statusType),
        },
        "acct.session_upserted",
      );
      break;
    }

    case AcctStatusType.AccountingOn: {
      const closed = await ctx.backend.closeNasSessions(parsed.nasIpAddress, "NAS-Reboot");
      log.info({ nas: ctx.nas.shortname, closed }, "acct.nas_started");
      break;
    }

    case AcctStatusType.AccountingOff: {
      const closed = await ctx.backend.closeNasSessions(parsed.nasIpAddress, "NAS-Request");
      log.info({ nas: ctx.nas.shortname, closed }, "acct.nas_stopped");
      break;
    }

    default:
      // Unknown status type — ack so the NAS moves on.
      log.warn(
        { nas: ctx.nas.shortname, statusType: parsed.statusType },
        "acct.unknown_status_type",
      );
  }

  return accountingResponse(request.identifier);
}

function accountingResponse(identifier: number): RadiusPacket {
  return {
    code: RadiusCode.AccountingResponse,
    identifier,
    // Filled in by computeResponseAuthenticator at send time.
    authenticator: Buffer.alloc(16),
    attributes: [],
  };
}
