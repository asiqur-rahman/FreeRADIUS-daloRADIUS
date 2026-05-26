// ─────────────────────────────────────────────────────────────────────
//  PAP authentication.
//
//  The User-Password attribute is decrypted with the shared secret +
//  Request Authenticator, then verified against the user's stored
//  Argon2id hash. PAP can only succeed against the same hash we use
//  for web auth, so the Phase-1 password change discipline (Argon2id
//  + NT-hash co-updated atomically) gives us PAP "for free".
// ─────────────────────────────────────────────────────────────────────

import argon2 from "argon2";
import { decryptUserPassword } from "../protocol/user-password.js";
import { log } from "../log.js";
import { isSubjectActive, type AuthSubject } from "./common.js";

export interface PapInputs {
  cipher: Buffer;
  requestAuthenticator: Buffer;
  secret: string;
  subject: AuthSubject;
}

export type PapOutcome =
  | { ok: true }
  | { ok: false; reason: string; classTag: string };

export async function authenticatePap(inputs: PapInputs): Promise<PapOutcome> {
  if (!isSubjectActive(inputs.subject)) {
    return { ok: false, reason: "Account is not active or has expired", classTag: "inactive" };
  }

  let plaintext: string;
  try {
    plaintext = decryptUserPassword(inputs.cipher, inputs.secret, inputs.requestAuthenticator);
  } catch (err) {
    log.warn({ err: (err as Error).message }, "pap.decrypt_failed");
    return { ok: false, reason: "Invalid User-Password encoding", classTag: "malformed" };
  }

  if (!plaintext) {
    return { ok: false, reason: "Empty password", classTag: "empty" };
  }

  const ok = await argon2.verify(inputs.subject.secret.passwordHashArgon2id, plaintext).catch(() => false);
  if (!ok) {
    return { ok: false, reason: "Wrong password", classTag: "bad_password" };
  }
  return { ok: true };
}
