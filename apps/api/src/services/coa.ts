import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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

function stringAttribute(type: number, value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > 253) throw new Error("RADIUS attribute is too long");
  return Buffer.concat([Buffer.from([type, encoded.length + 2]), encoded]);
}

function requestPacket(target: DisconnectTarget): { identifier: number; authenticator: Buffer; packet: Buffer } {
  const identifier = randomBytes(1)[0]!;
  const attributes = [
    stringAttribute(1, target.username),
    stringAttribute(44, target.acctSessionId),
    ...(target.callingStationId ? [stringAttribute(31, target.callingStationId)] : []),
  ];
  const body = Buffer.concat(attributes);
  const header = Buffer.alloc(4);
  header[0] = DISCONNECT_REQUEST;
  header[1] = identifier;
  header.writeUInt16BE(20 + body.length, 2);
  const authenticator = createHash("md5")
    .update(Buffer.concat([header, Buffer.alloc(16), body, Buffer.from(target.secret)]))
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

export async function sendDisconnectRequest(
  target: DisconnectTarget,
  timeoutMs = 2000,
): Promise<CoaDispatchResult> {
  const { identifier, authenticator, packet } = requestPacket(target);
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
