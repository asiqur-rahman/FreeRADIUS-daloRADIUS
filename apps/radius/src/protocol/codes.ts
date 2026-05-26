// ─────────────────────────────────────────────────────────────────────
//  RADIUS packet codes (RFC 2865 §3 + RFC 5176).
//  These are the only codes the platform sends or receives at present.
// ─────────────────────────────────────────────────────────────────────

export const RadiusCode = {
  AccessRequest: 1,
  AccessAccept: 2,
  AccessReject: 3,
  AccountingRequest: 4,
  AccountingResponse: 5,
  AccessChallenge: 11,
  DisconnectRequest: 40,
  DisconnectAck: 41,
  DisconnectNak: 42,
  CoaRequest: 43,
  CoaAck: 44,
  CoaNak: 45,
} as const;

export type RadiusCode = (typeof RadiusCode)[keyof typeof RadiusCode];

const NAMES: Record<number, string> = {
  1: "Access-Request",
  2: "Access-Accept",
  3: "Access-Reject",
  4: "Accounting-Request",
  5: "Accounting-Response",
  11: "Access-Challenge",
  40: "Disconnect-Request",
  41: "Disconnect-ACK",
  42: "Disconnect-NAK",
  43: "CoA-Request",
  44: "CoA-ACK",
  45: "CoA-NAK",
};

export function radiusCodeName(code: number): string {
  return NAMES[code] ?? `Unknown(${code})`;
}

/**
 * Codes whose Request Authenticator is computed from the packet content
 * (RFC 2866 §3 + RFC 5176 §2.3). Access-Request uses a random
 * Authenticator instead and is handled separately.
 */
export function isContentAuthenticatedRequest(code: number): boolean {
  return (
    code === RadiusCode.AccountingRequest ||
    code === RadiusCode.DisconnectRequest ||
    code === RadiusCode.CoaRequest
  );
}
