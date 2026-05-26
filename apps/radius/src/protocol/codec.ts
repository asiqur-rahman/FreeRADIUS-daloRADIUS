// ─────────────────────────────────────────────────────────────────────
//  RADIUS packet codec (RFC 2865 §3).
//
//  Packet layout:
//
//      0                   1                   2                   3
//      0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |     Code      |  Identifier   |            Length             |
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |                                                               |
//     |                         Authenticator                         |
//     |                                                               |
//     |                                                               |
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     | Attributes ...
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//
//  Each attribute is TLV: Type(1) + Length(1) + Value(Length-2).
//
//  The decoder is defensive: malformed packets throw. The dispatch
//  layer must treat parse failures as "silently drop" (RFC 2865 §3).
// ─────────────────────────────────────────────────────────────────────

import { MAX_ATTR_VALUE } from "./attributes.js";

export const RADIUS_HEADER_LENGTH = 20;
export const RADIUS_AUTHENTICATOR_LENGTH = 16;
export const RADIUS_MAX_PACKET = 4096;

export interface RadiusAttribute {
  type: number;
  value: Buffer;
}

export interface RadiusPacket {
  code: number;
  identifier: number;
  authenticator: Buffer; // exactly 16 bytes
  attributes: RadiusAttribute[];
}

export class RadiusDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadiusDecodeError";
  }
}

/**
 * Parse a UDP datagram into a RadiusPacket. Throws on any
 * structural inconsistency — callers must catch and drop.
 */
export function decode(buf: Buffer): RadiusPacket {
  if (buf.length < RADIUS_HEADER_LENGTH) {
    throw new RadiusDecodeError(`packet too short (${buf.length} bytes)`);
  }
  if (buf.length > RADIUS_MAX_PACKET) {
    throw new RadiusDecodeError(`packet too long (${buf.length} bytes)`);
  }

  const code = buf.readUInt8(0);
  const identifier = buf.readUInt8(1);
  const length = buf.readUInt16BE(2);

  if (length < RADIUS_HEADER_LENGTH) {
    throw new RadiusDecodeError(`stated length ${length} below header size`);
  }
  if (length > buf.length) {
    throw new RadiusDecodeError(`stated length ${length} exceeds buffer ${buf.length}`);
  }

  // RFC 2865: octets after stated length are ignored. We slice down
  // to the stated length so callers can rely on packet.length === length.
  const authenticator = Buffer.from(buf.subarray(4, RADIUS_HEADER_LENGTH));

  const attributes: RadiusAttribute[] = [];
  let offset = RADIUS_HEADER_LENGTH;
  while (offset < length) {
    if (length - offset < 2) {
      throw new RadiusDecodeError(`truncated attribute header at offset ${offset}`);
    }
    const type = buf.readUInt8(offset);
    const attrLength = buf.readUInt8(offset + 1);
    if (attrLength < 2) {
      throw new RadiusDecodeError(`attribute ${type} has length ${attrLength} (< 2)`);
    }
    if (offset + attrLength > length) {
      throw new RadiusDecodeError(
        `attribute ${type} length ${attrLength} extends past packet end`,
      );
    }
    attributes.push({
      type,
      value: Buffer.from(buf.subarray(offset + 2, offset + attrLength)),
    });
    offset += attrLength;
  }

  return { code, identifier, authenticator, attributes };
}

/**
 * Serialise a RadiusPacket to a Buffer. Throws if any attribute
 * value exceeds MAX_ATTR_VALUE.
 */
export function encode(packet: RadiusPacket): Buffer {
  if (packet.authenticator.length !== RADIUS_AUTHENTICATOR_LENGTH) {
    throw new Error(
      `authenticator must be ${RADIUS_AUTHENTICATOR_LENGTH} bytes (got ${packet.authenticator.length})`,
    );
  }
  const attrBytes: Buffer[] = [];
  let bodyLength = 0;
  for (const attr of packet.attributes) {
    if (attr.value.length > MAX_ATTR_VALUE) {
      throw new Error(
        `attribute ${attr.type} value ${attr.value.length} bytes exceeds RADIUS limit (${MAX_ATTR_VALUE})`,
      );
    }
    const tlv = Buffer.alloc(2 + attr.value.length);
    tlv.writeUInt8(attr.type, 0);
    tlv.writeUInt8(2 + attr.value.length, 1);
    attr.value.copy(tlv, 2);
    attrBytes.push(tlv);
    bodyLength += tlv.length;
  }
  const total = RADIUS_HEADER_LENGTH + bodyLength;
  if (total > RADIUS_MAX_PACKET) {
    throw new Error(`encoded packet ${total} bytes exceeds RADIUS_MAX_PACKET ${RADIUS_MAX_PACKET}`);
  }
  const out = Buffer.alloc(total);
  out.writeUInt8(packet.code, 0);
  out.writeUInt8(packet.identifier, 1);
  out.writeUInt16BE(total, 2);
  packet.authenticator.copy(out, 4);
  let offset = RADIUS_HEADER_LENGTH;
  for (const tlv of attrBytes) {
    tlv.copy(out, offset);
    offset += tlv.length;
  }
  return out;
}

// ── Attribute accessors ─────────────────────────────────────────────

export function findAttribute(packet: RadiusPacket, type: number): RadiusAttribute | undefined {
  return packet.attributes.find((a) => a.type === type);
}

export function findAllAttributes(packet: RadiusPacket, type: number): RadiusAttribute[] {
  return packet.attributes.filter((a) => a.type === type);
}

export function getString(packet: RadiusPacket, type: number): string | undefined {
  const a = findAttribute(packet, type);
  return a ? a.value.toString("utf8") : undefined;
}

export function getInteger(packet: RadiusPacket, type: number): number | undefined {
  const a = findAttribute(packet, type);
  if (!a || a.value.length !== 4) return undefined;
  return a.value.readUInt32BE(0);
}

export function getIpv4(packet: RadiusPacket, type: number): string | undefined {
  const a = findAttribute(packet, type);
  if (!a || a.value.length !== 4) return undefined;
  return `${a.value[0]}.${a.value[1]}.${a.value[2]}.${a.value[3]}`;
}

export function getOctets(packet: RadiusPacket, type: number): Buffer | undefined {
  const a = findAttribute(packet, type);
  return a ? a.value : undefined;
}

/**
 * Concatenated value of every attribute with the given type, in order
 * of appearance. Used for fragmented attributes such as EAP-Message.
 */
export function getConcatenated(packet: RadiusPacket, type: number): Buffer | undefined {
  const parts = findAllAttributes(packet, type).map((a) => a.value);
  if (parts.length === 0) return undefined;
  return Buffer.concat(parts);
}

// ── Attribute builders ──────────────────────────────────────────────

export function stringAttribute(type: number, value: string): RadiusAttribute {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > MAX_ATTR_VALUE) {
    throw new Error(`string attribute ${type} value too long (${bytes.length} bytes)`);
  }
  return { type, value: bytes };
}

export function octetsAttribute(type: number, value: Buffer): RadiusAttribute {
  if (value.length > MAX_ATTR_VALUE) {
    throw new Error(`octets attribute ${type} value too long (${value.length} bytes)`);
  }
  return { type, value: Buffer.from(value) };
}

export function integerAttribute(type: number, value: number): RadiusAttribute {
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff) {
    throw new Error(`integer attribute ${type} value out of range`);
  }
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return { type, value: buf };
}

export function ipv4Attribute(type: number, value: string): RadiusAttribute {
  const parts = value.split(".");
  if (parts.length !== 4) throw new Error(`invalid IPv4 literal '${value}'`);
  const buf = Buffer.alloc(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`invalid IPv4 octet in '${value}'`);
    }
    buf.writeUInt8(n, i);
  }
  return { type, value: buf };
}
