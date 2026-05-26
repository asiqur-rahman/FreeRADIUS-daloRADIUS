// ─────────────────────────────────────────────────────────────────────
//  EAP-MSCHAPv2 method (draft-kamath-pppext-eap-mschapv2).
//
//  Flow:
//    1. Supplicant → server: EAP-Response/Identity
//    2. Server → supplicant: EAP-Request/MSCHAPv2 (OpCode=Challenge)
//         Data: Challenge(16) | Name
//    3. Supplicant → server: EAP-Response/MSCHAPv2 (OpCode=Response)
//         Data: MS-CHAP2-Response struct (Ident|Flags|PeerCh|Reserved|NTResp|Name)
//    4. Server → supplicant: EAP-Request/MSCHAPv2 (OpCode=Success/Failure)
//         Success data: "S=<hex> M=<msg>"
//    5. Supplicant → server: EAP-Response/MSCHAPv2 (OpCode=Success/Failure)
//    6. Server → supplicant: EAP-Success / EAP-Failure
//
//  We re-use the existing crypto in protocol/mschap.ts; only the EAP
//  framing logic is new.
// ─────────────────────────────────────────────────────────────────────

import {
  challengeHash,
  computeNtResponse,
  generateAuthenticatorResponse,
  randomChallenge,
  verifyNtResponse,
} from "../../protocol/mschap.js";
import type { AuthSubject } from "../../auth/common.js";

const OpCode = {
  Challenge: 1,
  Response: 2,
  Success: 3,
  Failure: 4,
  ChangePassword: 7,
} as const;

export interface EapMsChapState {
  authChallenge: Buffer; // 16 bytes
  msChapId: number;      // MSCHAPv2 inner identifier
  /** Set once the supplicant's NT-Response has been verified — we expect
   *  one more round-trip (Success ack) before sending EAP-Success. */
  awaitingSuccessAck: boolean;
  expectedAuthenticatorResponse?: Buffer;
}

/**
 * Build the initial MSCHAPv2 Challenge packet (EAP type-data).
 * Format: OpCode(1) | MSCHAPv2-Id(1) | MS-Length(2) | Value-Size(1=16)
 *       | Challenge(16) | Name
 */
export function buildChallenge(state: EapMsChapState, serverName: string): Buffer {
  const name = Buffer.from(serverName, "utf8");
  const length = 1 + 1 + 2 + 1 + 16 + name.length;
  const out = Buffer.alloc(length);
  out.writeUInt8(OpCode.Challenge, 0);
  out.writeUInt8(state.msChapId, 1);
  out.writeUInt16BE(length, 2); // MS-Length echoes total length
  out.writeUInt8(16, 4); // Value-Size
  state.authChallenge.copy(out, 5);
  name.copy(out, 21);
  return out;
}

export interface MsChapV2VerifyOutcome {
  ok: true;
  authenticatorResponse: Buffer; // 20 bytes — formatted into "S=…" later
}
export interface MsChapV2VerifyFail {
  ok: false;
  reason: string;
}
export type MsChapV2Result = MsChapV2VerifyOutcome | MsChapV2VerifyFail;

/**
 * Parse the supplicant's MSCHAPv2 Response packet and verify against
 * the stored NT-hash.
 *
 * Response data layout (EAP type-data, after the EAP header is stripped):
 *   OpCode(1=Response) | MSCHAPv2-Id(1) | MS-Length(2)
 *   | Value-Size(1=49) | PeerChallenge(16) | Reserved(8) | NTResponse(24)
 *   | Flags(1) | Name(...)
 */
export function verifyResponse(
  typeData: Buffer,
  subject: AuthSubject,
  state: EapMsChapState,
  rawUsername: string,
): MsChapV2Result {
  if (typeData.length < 1 + 1 + 2 + 1 + 49) {
    return { ok: false, reason: "EAP-MSCHAPv2 Response too short" };
  }
  if (typeData[0] !== OpCode.Response) {
    return { ok: false, reason: "Expected MSCHAPv2 Response op-code" };
  }
  // Value-Size MUST be 49 for the Response packet.
  if (typeData[4] !== 49) {
    return { ok: false, reason: `Unexpected MSCHAPv2 value-size ${typeData[4]}` };
  }

  const peerChallenge = typeData.subarray(5, 21);
  // const reserved = typeData.subarray(21, 29);
  const ntResponse = typeData.subarray(29, 53);

  const ntHash = Buffer.from(subject.secret.ntHash, "hex");
  if (ntHash.length !== 16) {
    return { ok: false, reason: "Stored NT-hash is corrupt" };
  }

  const chHash = challengeHash(peerChallenge, state.authChallenge, rawUsername);
  const expected = computeNtResponse(ntHash, chHash);
  if (!verifyNtResponse(expected, ntResponse)) {
    return { ok: false, reason: "Wrong password" };
  }

  const authResp = generateAuthenticatorResponse(
    ntHash,
    ntResponse,
    peerChallenge,
    state.authChallenge,
    rawUsername,
  );
  return { ok: true, authenticatorResponse: authResp };
}

/**
 * Build the EAP-Request/MSCHAPv2 Success packet (sent after we've
 * verified the NT-Response). Supplicant responds with a Success op-code
 * of its own; the framework then emits EAP-Success.
 *
 * Type-data: OpCode(3) | MSCHAPv2-Id(1) | MS-Length(2) | "S=<hex> M=<msg>"
 */
export function buildSuccessRequest(msChapId: number, authenticatorResponse: Buffer): Buffer {
  const hex = authenticatorResponse.toString("hex").toUpperCase();
  const body = Buffer.from(`S=${hex} M=Authentication succeeded`, "ascii");
  const out = Buffer.alloc(1 + 1 + 2 + body.length);
  out.writeUInt8(OpCode.Success, 0);
  out.writeUInt8(msChapId & 0xff, 1);
  out.writeUInt16BE(out.length, 2);
  body.copy(out, 4);
  return out;
}

export function buildFailureRequest(msChapId: number, errorCode = 691): Buffer {
  // "E=<errorcode> R=0 V=3 M=<msg>" — RFC 2759 §8.4.
  // 691 = ERROR_AUTHENTICATION_FAILURE.
  const body = Buffer.from(`E=${errorCode} R=0 V=3 M=Authentication failed`, "ascii");
  const out = Buffer.alloc(1 + 1 + 2 + body.length);
  out.writeUInt8(OpCode.Failure, 0);
  out.writeUInt8(msChapId & 0xff, 1);
  out.writeUInt16BE(out.length, 2);
  body.copy(out, 4);
  return out;
}

export function newChallengeState(msChapId: number): EapMsChapState {
  return {
    authChallenge: randomChallenge(),
    msChapId,
    awaitingSuccessAck: false,
  };
}

export { OpCode as MsChapV2OpCode };
