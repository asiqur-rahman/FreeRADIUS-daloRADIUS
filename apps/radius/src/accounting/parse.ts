// ─────────────────────────────────────────────────────────────────────
//  Accounting-Request parser (RFC 2866).
//
//  Pulls the small set of attributes radacct needs out of a raw
//  RadiusPacket into a normalised, typed record. The persistence
//  layer never reads raw attributes — keeps the SQL clean.
//
//  Two flavours of "octets" handling:
//    - 32-bit Acct-Input/Output-Octets (RFC 2866) — fine up to 4 GiB.
//    - Acct-Input/Output-Gigawords (RFC 2869) — high 32 bits of the
//      same counter once it wraps. We combine both into BigInt totals
//      so the radacct BIGINT column gets the real value.
// ─────────────────────────────────────────────────────────────────────

import { AttrType } from "../protocol/attributes.js";
import {
  findAttribute,
  getInteger,
  getIpv4,
  getString,
  type RadiusPacket,
} from "../protocol/codec.js";

export const AcctStatusType = {
  Start: 1,
  Stop: 2,
  InterimUpdate: 3,
  AccountingOn: 7,
  AccountingOff: 8,
} as const;

export type AcctStatusType = (typeof AcctStatusType)[keyof typeof AcctStatusType];

// ── Wire enum → string label (matches FreeRADIUS dictionary text) ──
const TERMINATE_CAUSE: Record<number, string> = {
  1: "User-Request",
  2: "Lost-Carrier",
  3: "Lost-Service",
  4: "Idle-Timeout",
  5: "Session-Timeout",
  6: "Admin-Reset",
  7: "Admin-Reboot",
  8: "Port-Error",
  9: "NAS-Error",
  10: "NAS-Request",
  11: "NAS-Reboot",
  12: "Port-Unneeded",
  13: "Port-Preempted",
  14: "Port-Suspended",
  15: "Service-Unavailable",
  16: "Callback",
  17: "User-Error",
  18: "Host-Request",
};
const ACCT_AUTHENTIC: Record<number, string> = {
  1: "RADIUS",
  2: "Local",
  3: "Remote",
  4: "Diameter",
};
const SERVICE_TYPE: Record<number, string> = {
  1: "Login-User",
  2: "Framed-User",
  3: "Callback-Login-User",
  4: "Callback-Framed-User",
  5: "Outbound-User",
  6: "Administrative-User",
  7: "NAS-Prompt-User",
  8: "Authenticate-Only",
  9: "Callback-NAS-Prompt",
  10: "Call-Check",
  11: "Callback-Administrative",
};
const FRAMED_PROTOCOL: Record<number, string> = {
  1: "PPP",
  2: "SLIP",
  3: "ARAP",
  4: "Gandalf-SLML",
  5: "Xylogics-IPX-SLIP",
  6: "X.75-Synchronous",
};

export interface AccountingRequest {
  statusType: AcctStatusType;
  sessionId: string;            // empty string if absent — rare in real traffic
  username: string;
  nasIpAddress: string;         // packet source IP fallback applied by caller
  nasIdentifier: string | null;
  nasPort: number | null;
  nasPortType: string | null;
  calledStationId: string;
  callingStationId: string;
  framedIpAddress: string | null;

  inputOctets: bigint;
  outputOctets: bigint;
  inputPackets: number | null;
  outputPackets: number | null;
  sessionTime: number | null;

  acctAuthentic: string | null;
  serviceType: string | null;
  framedProtocol: string | null;
  terminateCause: string;       // empty string on Start/Interim
  klass: string | null;         // "class" is reserved
}

/**
 * Build a typed AccountingRequest from a parsed RADIUS packet.
 *
 * `peerAddress` is used when NAS-IP-Address isn't sent (some NASes
 * skip it on packets they expect the server to learn from the source).
 */
export function parseAccountingRequest(
  packet: RadiusPacket,
  peerAddress: string,
): AccountingRequest {
  const statusType = (getInteger(packet, AttrType.AcctStatusType) ?? 0) as AcctStatusType;

  const inputLow = getInteger(packet, AttrType.AcctInputOctets) ?? 0;
  const inputHigh = getInteger(packet, AttrType.AcctInputGigawords) ?? 0;
  const outputLow = getInteger(packet, AttrType.AcctOutputOctets) ?? 0;
  const outputHigh = getInteger(packet, AttrType.AcctOutputGigawords) ?? 0;

  const klass = findAttribute(packet, AttrType.Class);

  return {
    statusType,
    sessionId: getString(packet, AttrType.AcctSessionId) ?? "",
    username: getString(packet, AttrType.UserName) ?? "",
    nasIpAddress: getIpv4(packet, AttrType.NasIpAddress) ?? peerAddress,
    nasIdentifier: getString(packet, AttrType.NasIdentifier) ?? null,
    nasPort: getInteger(packet, AttrType.NasPort) ?? null,
    nasPortType: enumLabel(getInteger(packet, AttrType.NasPortType), {
      15: "Ethernet",
      19: "Wireless-802.11",
    }),
    calledStationId: getString(packet, AttrType.CalledStationId) ?? "",
    callingStationId: getString(packet, AttrType.CallingStationId) ?? "",
    framedIpAddress: getIpv4(packet, AttrType.FramedIpAddress) ?? null,

    inputOctets: (BigInt(inputHigh) << 32n) | BigInt(inputLow),
    outputOctets: (BigInt(outputHigh) << 32n) | BigInt(outputLow),
    inputPackets: getInteger(packet, AttrType.AcctInputPackets) ?? null,
    outputPackets: getInteger(packet, AttrType.AcctOutputPackets) ?? null,
    sessionTime: getInteger(packet, AttrType.AcctSessionTime) ?? null,

    acctAuthentic: enumLabel(getInteger(packet, AttrType.AcctAuthentic), ACCT_AUTHENTIC),
    serviceType: enumLabel(getInteger(packet, AttrType.ServiceType), SERVICE_TYPE),
    framedProtocol: enumLabel(getInteger(packet, AttrType.FramedProtocol), FRAMED_PROTOCOL),
    terminateCause:
      enumLabel(getInteger(packet, AttrType.AcctTerminateCause), TERMINATE_CAUSE) ?? "",
    klass: klass ? klass.value.toString("utf8") : null,
  };
}

function enumLabel(
  value: number | undefined,
  table: Record<number, string>,
): string | null {
  if (value === undefined) return null;
  return table[value] ?? null;
}
