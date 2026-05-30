import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createSocket } from "node:dgram";

export interface DisconnectTarget {
  host: string;
  port: number;
  secret: string;
  username: string;
  acctSessionId: string;
  callingStationId?: string | null;
}

export interface CoaDispatchResult {
  sent: boolean;
  acknowledged: boolean;
  outcome: "ack" | "nack" | "timeout" | "invalid_response" | "not_configured" | "send_error";
  message: string;
}

const DISCONNECT_REQUEST = 40;
const DISCONNECT_ACK = 41;
const DISCONNECT_NAK = 42;

// RADIUS attribute type numbers used here.
const ATTR_USER_NAME = 1;
const ATTR_CALLING_STATION_ID = 31;
const ATTR_ACCT_SESSION_ID = 44;
const ATTR_MESSAGE_AUTHENTICATOR = 80;

function stringAttribute(type: number, value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > 253) throw new Error("RADIUS attribute is too long");
  return Buffer.concat([Buffer.from([type, encoded.length + 2]), encoded]);
}

/**
 * Build a Disconnect-Request packet (RFC 5176).
 *
 * Includes a Message-Authenticator (attribute 80) — required by the
 * RFC and enforced by several mainstream NAS vendors (Cisco IOS-XE
 * outright drops requests without it). The HMAC-MD5 is computed over
 * the packet with both the header Authenticator field and the
 * Message-Authenticator value zeroed; the final Request Authenticator
 * is then computed in the conventional way over the packet with the
 * real Message-Authenticator in place.
 */
function requestPacket(target: DisconnectTarget): { identifier: number; authenticator: Buffer; packet: Buffer } {
  const identifier = randomBytes(1)[0]!;

  // Placeholder Message-Authenticator: TLV with 16 zero bytes of value.
  // We carry it as the last attribute so we can find its offset trivially.
  const msgAuthPlaceholder = Buffer.alloc(18);
  msgAuthPlaceholder[0] = ATTR_MESSAGE_AUTHENTICATOR;
  msgAuthPlaceholder[1] = 18;

  const attributes = [
    stringAttribute(ATTR_USER_NAME, target.username),
    stringAttribute(ATTR_ACCT_SESSION_ID, target.acctSessionId),
    ...(target.callingStationId ? [stringAttribute(ATTR_CALLING_STATION_ID, target.callingStationId)] : []),
    msgAuthPlaceholder,
  ];
  const body = Buffer.concat(attributes);

  const header = Buffer.alloc(4);
  header[0] = DISCONNECT_REQUEST;
  header[1] = identifier;
  header.writeUInt16BE(20 + body.length, 2);

  const zeroAuthenticator = Buffer.alloc(16);

  // Compute Message-Authenticator over: code | id | length | zero-auth | attrs-with-msg-auth-zeroed
  const msgAuth = createHmac("md5", target.secret)
    .update(Buffer.concat([header, zeroAuthenticator, body]))
    .digest();

  // Overwrite the placeholder value (16 bytes starting at offset 2 of the last TLV).
  msgAuth.copy(body, body.length - 16);

  // Now compute the Request Authenticator over the packet with the real
  // Message-Authenticator value in place (per RFC 5176 §2.3 / RFC 2866 §3).
  const authenticator = createHash("md5")
    .update(Buffer.concat([header, zeroAuthenticator, body, Buffer.from(target.secret)]))
    .digest();

  return { identifier, authenticator, packet: Buffer.concat([header, authenticator, body]) };
}

function validResponse(packet: Buffer, identifier: number, requestAuthenticator: Buffer, secret: string): boolean {
  if (packet.length < 20 || packet[1] !== identifier) return false;
  const statedLength = packet.readUInt16BE(2);
  if (statedLength !== packet.length) return false;
  const expected = createHash("md5")
    .update(Buffer.concat([packet.subarray(0, 4), requestAuthenticator, packet.subarray(20), Buffer.from(secret)]))
    .digest();
  return timingSafeEqual(packet.subarray(4, 20), expected);
}

/**
 * RFC 5176 §2.4 retransmission. We try the same packet (same Identifier
 * + Request Authenticator, so the NAS de-duplicates) up to MAX_ATTEMPTS
 * times with exponentially-growing waits between attempts. Returns as
 * soon as any attempt gets ACK or NAK; "timeout" means every attempt
 * elapsed without a response.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MULT = 2;

export async function sendDisconnectRequest(
  target: DisconnectTarget,
  timeoutMs = 2000,
): Promise<CoaDispatchResult> {
  const { identifier, authenticator, packet } = requestPacket(target);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const perAttemptTimeout = timeoutMs * Math.pow(BACKOFF_MULT, attempt - 1);
    const result = await sendOnce({
      packet,
      identifier,
      authenticator,
      target,
      timeoutMs: perAttemptTimeout,
    });
    if (result.outcome !== "timeout" && result.outcome !== "send_error") {
      return result;
    }
    if (result.outcome === "send_error") {
      // No point retrying a hard socket error.
      return result;
    }
    // else outcome === "timeout" → retry (unless this was the last attempt)
  }

  return {
    sent: true,
    acknowledged: false,
    outcome: "timeout",
    message: `NAS did not acknowledge after ${MAX_ATTEMPTS} attempts`,
  };
}

interface SendOnceInputs {
  packet: Buffer;
  identifier: number;
  authenticator: Buffer;
  target: DisconnectTarget;
  timeoutMs: number;
}

function sendOnce(inputs: SendOnceInputs): Promise<CoaDispatchResult> {
  const { packet, identifier, authenticator, target, timeoutMs } = inputs;
  const socket = createSocket(target.host.includes(":") ? "udp6" : "udp4");

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: CoaDispatchResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Sending can fail before dgram has bound the socket.
      }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({
        sent: true,
        acknowledged: false,
        outcome: "timeout",
        message: "NAS did not acknowledge the disconnect request before timeout",
      });
    }, timeoutMs);

    socket.on("message", (response) => {
      if (!validResponse(response, identifier, authenticator, target.secret)) {
        finish({
          sent: true,
          acknowledged: false,
          outcome: "invalid_response",
          message: "NAS returned a response with an invalid authenticator",
        });
        return;
      }
      if (response[0] === DISCONNECT_ACK) {
        finish({ sent: true, acknowledged: true, outcome: "ack", message: "Disconnect acknowledged by NAS" });
        return;
      }
      if (response[0] === DISCONNECT_NAK) {
        finish({ sent: true, acknowledged: false, outcome: "nack", message: "NAS rejected the disconnect request" });
      }
    });
    socket.once("error", (err) => {
      finish({ sent: false, acknowledged: false, outcome: "send_error", message: err.message });
    });
    socket.send(packet, target.port, target.host, (err) => {
      if (err) {
        finish({ sent: false, acknowledged: false, outcome: "send_error", message: err.message });
      }
    });
  });
}
