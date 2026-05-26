// ─────────────────────────────────────────────────────────────────────
//  EAP packet codec (RFC 3748).
//
//  EAP layout — independent of RADIUS, carried inside one or more
//  EAP-Message (attr 79) attributes that simply concatenate on the
//  wire (RFC 3579 §3.1).
//
//      0                   1                   2                   3
//      0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |     Code      |   Identifier  |            Length             |
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |     Type      |    Type-Data ...
//     +-+-+-+-+-+-+-+-+
//
//  Code  : 1=Request, 2=Response, 3=Success, 4=Failure
//  Length: total length of the EAP packet, including header
//  Type  : (only on Request/Response) — Identity=1, Notification=2,
//          MD5-Challenge=4, MSCHAPv2=26, PEAP=25, EAP-TLS=13, etc.
// ─────────────────────────────────────────────────────────────────────

export const EapCode = {
  Request: 1,
  Response: 2,
  Success: 3,
  Failure: 4,
} as const;

export type EapCode = (typeof EapCode)[keyof typeof EapCode];

export const EapType = {
  Identity: 1,
  Notification: 2,
  Nak: 3,
  Md5Challenge: 4,
  Tls: 13,
  Peap: 25,
  MsChapV2: 26,
} as const;

export type EapType = (typeof EapType)[keyof typeof EapType];

export interface EapPacket {
  code: number;
  identifier: number;
  type?: number;     // omitted for Success / Failure
  data: Buffer;      // type-data; empty for Success / Failure
}

export class EapDecodeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "EapDecodeError";
  }
}

export function decodeEap(buf: Buffer): EapPacket {
  if (buf.length < 4) throw new EapDecodeError(`EAP packet too short: ${buf.length}`);
  const code = buf.readUInt8(0);
  const identifier = buf.readUInt8(1);
  const length = buf.readUInt16BE(2);
  if (length < 4) throw new EapDecodeError(`EAP length < 4 (${length})`);
  if (length > buf.length) {
    throw new EapDecodeError(`EAP length ${length} exceeds buffer ${buf.length}`);
  }
  if (code === EapCode.Success || code === EapCode.Failure) {
    return { code, identifier, data: Buffer.alloc(0) };
  }
  if (length < 5) throw new EapDecodeError("EAP Request/Response missing Type byte");
  const type = buf.readUInt8(4);
  const data = Buffer.from(buf.subarray(5, length));
  return { code, identifier, type, data };
}

export function encodeEap(packet: EapPacket): Buffer {
  if (packet.code === EapCode.Success || packet.code === EapCode.Failure) {
    const out = Buffer.alloc(4);
    out.writeUInt8(packet.code, 0);
    out.writeUInt8(packet.identifier, 1);
    out.writeUInt16BE(4, 2);
    return out;
  }
  if (packet.type === undefined) {
    throw new Error("EAP Request/Response requires a Type");
  }
  const length = 5 + packet.data.length;
  const out = Buffer.alloc(length);
  out.writeUInt8(packet.code, 0);
  out.writeUInt8(packet.identifier, 1);
  out.writeUInt16BE(length, 2);
  out.writeUInt8(packet.type, 4);
  packet.data.copy(out, 5);
  return out;
}

// ── EAP-Message fragmentation across RADIUS attrs ──────────────────
//   EAP-Message can carry at most 253 bytes per RADIUS attribute, so
//   long EAP packets get sliced. The receiver concatenates in order.

export function chunkForEapMessage(eapBytes: Buffer): Buffer[] {
  const CHUNK = 253;
  if (eapBytes.length <= CHUNK) return [eapBytes];
  const chunks: Buffer[] = [];
  for (let off = 0; off < eapBytes.length; off += CHUNK) {
    chunks.push(Buffer.from(eapBytes.subarray(off, Math.min(off + CHUNK, eapBytes.length))));
  }
  return chunks;
}
