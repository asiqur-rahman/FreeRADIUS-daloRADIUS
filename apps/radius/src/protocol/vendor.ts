// ─────────────────────────────────────────────────────────────────────
//  Vendor-Specific Attribute codec (RFC 2865 §5.26).
//
//  Wire format for the canonical "Type 26" form (the only one we
//  support — RFC §5.26 allows non-canonical layouts but no major
//  vendor uses them):
//
//      Type      = 26
//      Length    = 6 + Σ subattribute length
//      Vendor-Id = 4 bytes BE
//      [ Vendor-Type | Vendor-Length | Vendor-Value ]…
// ─────────────────────────────────────────────────────────────────────

import { AttrType, MAX_ATTR_VALUE } from "./attributes.js";
import { findAllAttributes, type RadiusAttribute, type RadiusPacket } from "./codec.js";

export const VendorId = {
  Microsoft: 311,
} as const;

export interface VendorAttribute {
  vendorId: number;
  vendorType: number;
  value: Buffer;
}

/**
 * Parse every VSA in a packet into a flat list. Subattributes from
 * the same parent VSA share a vendorId. Malformed inner TLVs are
 * silently skipped — we never throw out of a parser; the caller
 * decides whether a missing attribute is fatal.
 */
export function decodeAllVsas(packet: RadiusPacket): VendorAttribute[] {
  const result: VendorAttribute[] = [];
  for (const attr of findAllAttributes(packet, AttrType.VendorSpecific)) {
    if (attr.value.length < 4) continue;
    const vendorId = attr.value.readUInt32BE(0);
    let offset = 4;
    while (offset + 2 <= attr.value.length) {
      const vt = attr.value.readUInt8(offset);
      const vl = attr.value.readUInt8(offset + 1);
      if (vl < 2 || offset + vl > attr.value.length) break;
      result.push({
        vendorId,
        vendorType: vt,
        value: Buffer.from(attr.value.subarray(offset + 2, offset + vl)),
      });
      offset += vl;
    }
  }
  return result;
}

export function findVsa(
  packet: RadiusPacket,
  vendorId: number,
  vendorType: number,
): Buffer | undefined {
  return decodeAllVsas(packet).find((v) => v.vendorId === vendorId && v.vendorType === vendorType)
    ?.value;
}

/**
 * Build a single VSA attribute holding one sub-attribute. We don't
 * pack multiple sub-attrs into one parent because the few VSAs we
 * emit (MS-CHAP2-Success, MS-CHAP-Error, MPPE keys) are larger than
 * makes packing useful, and one-per-parent keeps the encoder simple.
 */
export function vendorAttribute(
  vendorId: number,
  vendorType: number,
  value: Buffer,
): RadiusAttribute {
  // Outer Type=26 + Length(1) + Vendor-Id(4) + Vendor-Type(1) + Vendor-Length(1) + value
  // The Length field constraint is the outer RADIUS attribute, value ≤ 253.
  // Outer value = vendor-id (4) + inner TLV (2 + value.length).
  const outerValueLength = 4 + 2 + value.length;
  if (outerValueLength > MAX_ATTR_VALUE) {
    throw new Error(`VSA (${vendorId}/${vendorType}) value too long: ${value.length} bytes`);
  }
  const buf = Buffer.alloc(outerValueLength);
  buf.writeUInt32BE(vendorId, 0);
  buf.writeUInt8(vendorType, 4);
  buf.writeUInt8(2 + value.length, 5);
  value.copy(buf, 6);
  return { type: AttrType.VendorSpecific, value: buf };
}
