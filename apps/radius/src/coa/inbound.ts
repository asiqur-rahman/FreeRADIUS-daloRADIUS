// ─────────────────────────────────────────────────────────────────────
//  Inbound CoA / Disconnect handler (RFC 5176).
//
//  When acting as a *Dynamic Authorization Server* we'd accept these
//  packets and push changes to the NAS. We're not that — we're an
//  *auth + accounting* server. But some upstream systems (billing,
//  identity providers, captive-portal controllers) may still send us
//  these packets expecting us to forward / forget / NAK them.
//
//  Per RFC 5176 §3.3 we MUST reply with one of:
//    - Disconnect-NAK / CoA-NAK with Error-Cause = 405 "Session Context
//      Not Found" (or 406 "Unsupported Extension" / 502 "Request Not
//      Routable") — for the foreseeable future we always NAK with 405
//      because we don't have a NAS session table to disconnect from.
//
//  Returning NAK is the conformant answer; silent drop would make peers
//  retry forever and burn link.
// ─────────────────────────────────────────────────────────────────────

import { findAttribute, octetsAttribute, type RadiusPacket } from "../protocol/codec.js";
import { RadiusCode } from "../protocol/codes.js";
import { AttrType } from "../protocol/attributes.js";
import { log } from "../log.js";

// RFC 5176 §3.5 — Error-Cause attribute. Top-level RADIUS attribute
// type 101, value is a 32-bit integer.
const ATTR_ERROR_CAUSE = 101;

const ErrorCause = {
  SessionContextNotFound: 503, // session referenced wasn't found
  ResidualSessionContextRemoved: 504,
  InvalidRequest: 404,
  UnsupportedService: 405,
  UnsupportedExtension: 406,
  AdministrativelyProhibited: 501,
  RequestNotRoutable: 502,
} as const;

function errorCauseAttribute(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return octetsAttribute(ATTR_ERROR_CAUSE, buf);
}

export function handleDisconnectRequest(request: RadiusPacket): RadiusPacket {
  const proxyState = findAttribute(request, AttrType.ProxyState);
  log.info(
    { id: request.identifier, hasProxyState: !!proxyState },
    "coa.disconnect_received_nak",
  );

  // Always NAK: this server doesn't own NAS sessions and can't honour
  // a disconnect. The Error-Cause tells the peer why.
  return {
    code: RadiusCode.DisconnectNak,
    identifier: request.identifier,
    authenticator: Buffer.alloc(16),
    attributes: [
      errorCauseAttribute(ErrorCause.SessionContextNotFound),
      // RFC 2865 §5.33 — echo Proxy-State unchanged when present.
      ...(proxyState ? [proxyState] : []),
    ],
  };
}

export function handleCoaRequest(request: RadiusPacket): RadiusPacket {
  const proxyState = findAttribute(request, AttrType.ProxyState);
  log.info({ id: request.identifier }, "coa.coa_received_nak");

  return {
    code: RadiusCode.CoaNak,
    identifier: request.identifier,
    authenticator: Buffer.alloc(16),
    attributes: [
      errorCauseAttribute(ErrorCause.AdministrativelyProhibited),
      ...(proxyState ? [proxyState] : []),
    ],
  };
}
