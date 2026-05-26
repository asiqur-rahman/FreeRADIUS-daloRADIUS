// ─────────────────────────────────────────────────────────────────────
//  Attribute dictionary.
//
//  We deliberately keep this small — only the attributes the platform
//  reads or writes. Extending it is a one-line addition; we are not
//  trying to be a general-purpose RADIUS implementation.
//
//  Reference: RFC 2865 §5 (standard attributes), RFC 2866 §5 (acct),
//  RFC 2869, RFC 3579 (EAP + Message-Authenticator), RFC 5176 (CoA).
// ─────────────────────────────────────────────────────────────────────

export const AttrType = {
  UserName: 1,
  UserPassword: 2,
  ChapPassword: 3,
  NasIpAddress: 4,
  NasPort: 5,
  ServiceType: 6,
  FramedProtocol: 7,
  FramedIpAddress: 8,
  FramedMtu: 12,
  ReplyMessage: 18,
  State: 24,
  Class: 25,
  VendorSpecific: 26,
  SessionTimeout: 27,
  IdleTimeout: 28,
  CalledStationId: 30,
  CallingStationId: 31,
  NasIdentifier: 32,
  ProxyState: 33,
  AcctStatusType: 40,
  AcctDelayTime: 41,
  AcctInputOctets: 42,
  AcctOutputOctets: 43,
  AcctSessionId: 44,
  AcctAuthentic: 45,
  AcctSessionTime: 46,
  AcctInputPackets: 47,
  AcctOutputPackets: 48,
  AcctTerminateCause: 49,
  AcctMultiSessionId: 50,
  AcctLinkCount: 51,
  AcctInputGigawords: 52,
  AcctOutputGigawords: 53,
  EventTimestamp: 55,
  ChapChallenge: 60,
  NasPortType: 61,
  TunnelType: 64,
  TunnelMediumType: 65,
  EapMessage: 79,
  MessageAuthenticator: 80,
  TunnelPrivateGroupId: 81,
  NasPortId: 87,
} as const;

export type AttrType = (typeof AttrType)[keyof typeof AttrType];

const NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(AttrType).map(([name, code]) => [code as number, name]),
);

export function attrTypeName(type: number): string {
  return NAMES[type] ?? `Attr(${type})`;
}

// Max value bytes in a single attribute TLV (255 - 2 for type+length).
export const MAX_ATTR_VALUE = 253;

// Length of the Message-Authenticator value (16-byte HMAC-MD5).
export const MESSAGE_AUTHENTICATOR_VALUE_LENGTH = 16;
// Length of the full Message-Authenticator TLV (type+length+value).
export const MESSAGE_AUTHENTICATOR_TLV_LENGTH = 2 + MESSAGE_AUTHENTICATOR_VALUE_LENGTH;
