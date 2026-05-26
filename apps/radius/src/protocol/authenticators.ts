// ─────────────────────────────────────────────────────────────────────
//  Authenticator + Message-Authenticator helpers.
//
//  Three independent integrity mechanisms RADIUS uses:
//
//  • Request Authenticator
//      Access-Request → 16 random bytes (the client's nonce).
//      Accounting/CoA/Disconnect-Request → MD5(packet-with-auth-zeros + secret).
//
//  • Response Authenticator
//      Any response (Accept/Reject/Challenge/Acct-Response/CoA-ACK/NAK):
//      MD5(Code | Id | Length | RequestAuth | Attrs | Secret)
//
//  • Message-Authenticator (attribute 80, HMAC-MD5, RFC 2869 §5.14)
//      Optional in legacy RADIUS, MUST be present for EAP messages
//      (RFC 3579) and for CoA/Disconnect (RFC 5176).
//      Computed over the on-wire packet with the Message-Authenticator
//      *value* (not the header Authenticator) replaced by zeros.
//
//  All MD5/HMAC operations use timingSafeEqual on the verify path.
// ─────────────────────────────────────────────────────────────────────

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  AttrType,
  MESSAGE_AUTHENTICATOR_TLV_LENGTH,
  MESSAGE_AUTHENTICATOR_VALUE_LENGTH,
} from "./attributes.js";
import {
  RADIUS_AUTHENTICATOR_LENGTH,
  RADIUS_HEADER_LENGTH,
  encode,
  findAttribute,
  type RadiusPacket,
} from "./codec.js";
import { isContentAuthenticatedRequest, RadiusCode } from "./codes.js";

const ZERO_AUTHENTICATOR = Buffer.alloc(RADIUS_AUTHENTICATOR_LENGTH);

export function randomAuthenticator(): Buffer {
  return randomBytes(RADIUS_AUTHENTICATOR_LENGTH);
}

// ── Request Authenticator (content-derived codes) ──────────────────

/**
 * Compute the Request Authenticator for Accounting / CoA / Disconnect
 * Requests. Packet.authenticator is irrelevant on input; this function
 * uses the 16-zero placeholder per RFC 2866 §3.
 */
export function computeRequestAuthenticator(packet: RadiusPacket, secret: string): Buffer {
  if (!isContentAuthenticatedRequest(packet.code)) {
    throw new Error(
      `computeRequestAuthenticator called on code ${packet.code} — only valid for ` +
        "Accounting/CoA/Disconnect-Request",
    );
  }
  const withZeroAuth: RadiusPacket = { ...packet, authenticator: ZERO_AUTHENTICATOR };
  const serialised = encode(withZeroAuth);
  return createHash("md5")
    .update(serialised)
    .update(Buffer.from(secret))
    .digest();
}

/**
 * Verify the Request Authenticator on a received Accounting/CoA/
 * Disconnect-Request. Returns false (and never throws) on mismatch
 * so the caller can silently drop per RFC 2865.
 *
 * If a Message-Authenticator attribute is present its value is
 * already final on the wire, so we use the packet as-is.
 */
export function verifyRequestAuthenticator(packet: RadiusPacket, secret: string): boolean {
  if (!isContentAuthenticatedRequest(packet.code)) return false;
  const expected = computeRequestAuthenticator(packet, secret);
  return safeEqual(expected, packet.authenticator);
}

// ── Response Authenticator ─────────────────────────────────────────

/**
 * Compute the Response Authenticator (RFC 2865 §3) for any response
 * packet, using the Request Authenticator from the original request.
 */
export function computeResponseAuthenticator(
  responsePacket: RadiusPacket,
  requestAuthenticator: Buffer,
  secret: string,
): Buffer {
  // Serialise the response with the request authenticator placed
  // into the header — that's the formula in the RFC.
  const withReqAuth: RadiusPacket = { ...responsePacket, authenticator: requestAuthenticator };
  const serialised = encode(withReqAuth);
  return createHash("md5")
    .update(serialised)
    .update(Buffer.from(secret))
    .digest();
}

export function verifyResponseAuthenticator(
  responseBuffer: Buffer,
  requestAuthenticator: Buffer,
  secret: string,
): boolean {
  if (responseBuffer.length < RADIUS_HEADER_LENGTH) return false;
  const onWireAuth = responseBuffer.subarray(4, RADIUS_HEADER_LENGTH);
  // Recompute by substituting requestAuthenticator into the header copy
  // and hashing header(with-req-auth) + attrs + secret.
  const headerWithReqAuth = Buffer.concat([
    responseBuffer.subarray(0, 4),
    requestAuthenticator,
  ]);
  const attrs = responseBuffer.subarray(RADIUS_HEADER_LENGTH);
  const expected = createHash("md5")
    .update(headerWithReqAuth)
    .update(attrs)
    .update(Buffer.from(secret))
    .digest();
  return safeEqual(expected, Buffer.from(onWireAuth));
}

// ── Message-Authenticator (HMAC-MD5, attribute 80) ─────────────────

/**
 * Compute the Message-Authenticator over a serialised packet. The
 * caller is responsible for placing 16 zero bytes in the value slot
 * of the Message-Authenticator attribute prior to calling.
 *
 * Whichever Authenticator is in the header at the time of the call
 * is what's hashed — for an outgoing Access-Request, that's the
 * random nonce; for Accounting/CoA/Disconnect, the convention is to
 * use a zero-Authenticator and compute the Message-Authenticator
 * *before* the Request Authenticator (the wpa_supplicant pattern).
 */
export function computeMessageAuthenticator(serialised: Buffer, secret: string): Buffer {
  return createHmac("md5", secret).update(serialised).digest();
}

/**
 * For a *response* (Access-Accept/Reject/Challenge) that includes a
 * Message-Authenticator placeholder: fill the placeholder with the
 * real HMAC value. RFC 3579 §3.2 mandates the attribute on every
 * RADIUS response that carries EAP-Message.
 *
 * The HMAC input is the response packet serialised with the
 * **request's** Authenticator (not the eventual Response Authenticator)
 * substituted into the header. Mutates the buffer behind the
 * Message-Authenticator attribute in place.
 *
 * Returns `true` if a placeholder was found and filled.
 */
export function fillResponseMessageAuthenticator(
  response: RadiusPacket,
  requestAuthenticator: Buffer,
  secret: string,
): boolean {
  const attr = findAttribute(response, AttrType.MessageAuthenticator);
  if (!attr || attr.value.length !== MESSAGE_AUTHENTICATOR_VALUE_LENGTH) return false;

  // Zero out before HMACing (idempotent — placeholder is already zero,
  // but if the caller is re-signing a packet we need this).
  attr.value.fill(0);

  // Build the buffer the HMAC is taken over: header(with-request-auth) + attrs.
  const withReqAuth: RadiusPacket = { ...response, authenticator: requestAuthenticator };
  const serialised = encode(withReqAuth);

  const hmac = computeMessageAuthenticator(serialised, secret);
  hmac.copy(attr.value);
  return true;
}

/**
 * Verify a received packet's Message-Authenticator. Returns false if
 * the attribute is missing or invalid. The packet object is not
 * mutated; the value is zeroed only inside a temporary buffer.
 */
export function verifyMessageAuthenticator(packet: RadiusPacket, secret: string): boolean {
  const attr = findAttribute(packet, AttrType.MessageAuthenticator);
  if (!attr || attr.value.length !== MESSAGE_AUTHENTICATOR_VALUE_LENGTH) return false;

  const savedValue = Buffer.from(attr.value);
  const zeroed: RadiusPacket = {
    ...packet,
    attributes: packet.attributes.map((a) =>
      a.type === AttrType.MessageAuthenticator
        ? { type: a.type, value: Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH) }
        : a,
    ),
  };
  const expected = computeMessageAuthenticator(encode(zeroed), secret);
  return safeEqual(expected, savedValue);
}

// ── Helpers ────────────────────────────────────────────────────────

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Re-export commonly used constants/values to keep imports flat at callsites.
export {
  AttrType,
  MESSAGE_AUTHENTICATOR_TLV_LENGTH,
  MESSAGE_AUTHENTICATOR_VALUE_LENGTH,
  RadiusCode,
  ZERO_AUTHENTICATOR,
};
