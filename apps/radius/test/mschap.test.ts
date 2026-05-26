// ─────────────────────────────────────────────────────────────────────
//  MSCHAPv2 known-vector tests from RFC 2759 §9.2.
//
//  These are the gold standard for catching MD4/DES/SHA-1 bugs — if
//  ChallengeHash, NT-Response, or AuthenticatorResponse drift from
//  the spec by even one bit, every supplicant in the building fails.
// ─────────────────────────────────────────────────────────────────────
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  challengeHash,
  computeNtResponse,
  generateAuthenticatorResponse,
  nthashOfPassword,
} from "../src/protocol/mschap.js";

// RFC 2759 §9.2 — test vectors verbatim.
const USERNAME = "User";
const PASSWORD = "clientPass";
const AUTH_CHALLENGE = Buffer.from(
  "5B5D7C7D7B3F2F3E3C2C602132262628",
  "hex",
);
const PEER_CHALLENGE = Buffer.from(
  "21402324255E262A28295F2B3A337C7E",
  "hex",
);
const EXPECTED_NT_HASH = Buffer.from("44EBBA8D5312B8D611474411F56989AE", "hex");
const EXPECTED_CHALLENGE_HASH = Buffer.from("D02E4386BCE91226", "hex");
const EXPECTED_NT_RESPONSE = Buffer.from(
  "82309ECD8D708B5EA08FAA3981CD83544233114A3D85D6DF",
  "hex",
);
const EXPECTED_AUTH_RESPONSE_HEX =
  "407A5589115FD0D6209F510FE9C04566932CDA56";

describe("MSCHAPv2 / RFC 2759 §9.2 vectors", () => {
  it("computes NT-hash of 'clientPass' as MD4(UTF-16LE)", () => {
    assert.deepEqual(nthashOfPassword(PASSWORD), EXPECTED_NT_HASH);
  });

  it("ChallengeHash = SHA1(Peer || Auth || User)[0..8]", () => {
    assert.deepEqual(
      challengeHash(PEER_CHALLENGE, AUTH_CHALLENGE, USERNAME),
      EXPECTED_CHALLENGE_HASH,
    );
  });

  it("NT-Response from NT-hash + ChallengeHash matches the spec vector", () => {
    const chHash = challengeHash(PEER_CHALLENGE, AUTH_CHALLENGE, USERNAME);
    const ntResponse = computeNtResponse(EXPECTED_NT_HASH, chHash);
    assert.deepEqual(ntResponse, EXPECTED_NT_RESPONSE);
  });

  it("AuthenticatorResponse (hex) matches the spec vector", () => {
    const digest = generateAuthenticatorResponse(
      EXPECTED_NT_HASH,
      EXPECTED_NT_RESPONSE,
      PEER_CHALLENGE,
      AUTH_CHALLENGE,
      USERNAME,
    );
    assert.equal(digest.toString("hex").toUpperCase(), EXPECTED_AUTH_RESPONSE_HEX);
  });
});
