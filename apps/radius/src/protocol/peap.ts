// ─────────────────────────────────────────────────────────────────────
//  EAP-PEAP packet codec (draft-josefsson-pppext-eap-tls-eap).
//
//  EAP type 25. Wire format inside the EAP type-data:
//
//      0                   1                   2                   3
//      0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |L M S R R V V V|  TLS Message Length …  (only if L=1)         |
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//     |  TLS Message Length cont. (4 bytes total) | TLS Data ...     |
//     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//
//  Flag bits:
//    L = Length included (the 4-byte TLS Message Length field follows)
//    M = More fragments (more PEAP packets carry the rest of this TLS message)
//    S = Start  (server-only; signals beginning of TLS handshake)
//    R = Reserved (must be zero)
//    V V V = PEAP version (0 or 1 in practice; supplicants negotiate)
//
//  An EMPTY PEAP packet (4-byte EAP header + 1 flag byte == 5 bytes)
//  is an ACK that the receiver got the last fragment and wants more.
// ─────────────────────────────────────────────────────────────────────

export const PeapFlag = {
  Length: 0x80,
  More: 0x40,
  Start: 0x20,
  // 0x18 reserved
  VersionMask: 0x07,
} as const;

export interface PeapPacket {
  /** Negotiated version (0 or 1). */
  version: number;
  lengthIncluded: boolean;
  moreFragments: boolean;
  start: boolean;
  /** Only meaningful when lengthIncluded is true. */
  totalLength?: number;
  /** TLS bytes carried by this fragment. Empty for ACKs and pure Start. */
  tls: Buffer;
}

/** Decode the EAP-PEAP type-data (everything after the EAP header's Type byte). */
export function decodePeap(typeData: Buffer): PeapPacket {
  if (typeData.length < 1) {
    throw new Error("PEAP packet missing flag byte");
  }
  const flags = typeData[0]!;
  const version = flags & PeapFlag.VersionMask;
  const lengthIncluded = (flags & PeapFlag.Length) !== 0;
  const moreFragments = (flags & PeapFlag.More) !== 0;
  const start = (flags & PeapFlag.Start) !== 0;

  let offset = 1;
  let totalLength: number | undefined;
  if (lengthIncluded) {
    if (typeData.length < 5) throw new Error("PEAP L=1 but length field truncated");
    totalLength = typeData.readUInt32BE(1);
    offset = 5;
  }
  const tls = Buffer.from(typeData.subarray(offset));
  return { version, lengthIncluded, moreFragments, start, totalLength, tls };
}

/** Encode a PEAP packet into the EAP type-data buffer. */
export function encodePeap(pkt: PeapPacket): Buffer {
  let flags = pkt.version & PeapFlag.VersionMask;
  if (pkt.lengthIncluded) flags |= PeapFlag.Length;
  if (pkt.moreFragments) flags |= PeapFlag.More;
  if (pkt.start) flags |= PeapFlag.Start;

  const headerLen = pkt.lengthIncluded ? 5 : 1;
  const out = Buffer.alloc(headerLen + pkt.tls.length);
  out.writeUInt8(flags, 0);
  if (pkt.lengthIncluded) {
    out.writeUInt32BE(pkt.totalLength ?? pkt.tls.length, 1);
  }
  pkt.tls.copy(out, headerLen);
  return out;
}

export const PEAP_MTU = 1024; // max TLS bytes per PEAP fragment we emit
