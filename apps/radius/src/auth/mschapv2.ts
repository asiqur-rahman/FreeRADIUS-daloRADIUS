// ─────────────────────────────────────────────────────────────────────
//  MSCHAPv2 authentication (RFC 2759).
//
//  Inputs from the wire (all in Microsoft VSAs, vendor 311):
//    MS-CHAP-Challenge   (VSA 11) → 16-byte Auth-Challenge
//    MS-CHAP2-Response   (VSA 25) → Ident, Peer-Challenge, NT-Response
//
//  Verification:
//    expected = NT-Response computed from stored NT-hash + ChallengeHash
//    success iff timingSafeEqual(expected, on-wire NT-Response)
//
//  On success we also build the "S=<hex> M=…" string the client uses
//  to authenticate the *server*. Without that, the supplicant tears
//  the link down even after a valid Access-Accept.
// ─────────────────────────────────────────────────────────────────────

import {
  challengeHash,
  computeNtResponse,
  formatChap2Success,
  generateAuthenticatorResponse,
  parseMsChap2Response,
  verifyNtResponse,
} from "../protocol/mschap.js";
import { isSubjectActive, type AuthSubject } from "./common.js";

export interface MsChapV2Inputs {
  authChallenge: Buffer;   // 16 bytes from MS-CHAP-Challenge VSA
  responseRaw: Buffer;     // 50 bytes from MS-CHAP2-Response VSA
  rawUsername: string;     // exactly as it appeared in the User-Name attr
  subject: AuthSubject;
}

export type MsChapV2Outcome =
  | { ok: true; ident: number; successMessage: Buffer }
  | { ok: false; reason: string; classTag: string };

export function authenticateMsChapV2(inputs: MsChapV2Inputs): MsChapV2Outcome {
  if (!isSubjectActive(inputs.subject)) {
    return { ok: false, reason: "Account is not active or has expired", classTag: "inactive" };
  }
  if (inputs.authChallenge.length !== 16) {
    return { ok: false, reason: "MS-CHAP-Challenge must be 16 bytes", classTag: "malformed" };
  }

  let parsed;
  try {
    parsed = parseMsChap2Response(inputs.responseRaw);
  } catch {
    return { ok: false, reason: "Malformed MS-CHAP2-Response", classTag: "malformed" };
  }

  // The stored NT-hash is hex-uppercase; convert to raw bytes.
  const ntHash = Buffer.from(inputs.subject.secret.ntHash, "hex");
  if (ntHash.length !== 16) {
    return { ok: false, reason: "Stored NT-hash is corrupt", classTag: "internal" };
  }

  const chHash = challengeHash(parsed.peerChallenge, inputs.authChallenge, inputs.rawUsername);
  const expectedNtResponse = computeNtResponse(ntHash, chHash);
  if (!verifyNtResponse(expectedNtResponse, parsed.ntResponse)) {
    return { ok: false, reason: "Wrong password", classTag: "bad_password" };
  }

  const authResp = generateAuthenticatorResponse(
    ntHash,
    parsed.ntResponse,
    parsed.peerChallenge,
    inputs.authChallenge,
    inputs.rawUsername,
  );
  return { ok: true, ident: parsed.ident, successMessage: formatChap2Success(parsed.ident, authResp) };
}
