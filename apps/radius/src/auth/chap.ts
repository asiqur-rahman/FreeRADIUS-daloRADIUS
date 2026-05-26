// ─────────────────────────────────────────────────────────────────────
//  CHAP — explicitly unsupported.
//
//  CHAP (RFC 1994) requires the server to recompute MD5(Ident || password
//  || Challenge), which requires *plaintext* passwords. The platform's
//  security model stores Argon2id + NT-hash and never sees plaintext
//  after enrolment, so CHAP cannot succeed.
//
//  Most modern NAS firmware lets the admin disable CHAP. If you see this
//  reject reason in radpostauth, reconfigure the AP/switch to use PAP
//  or PEAP-MSCHAPv2 instead.
// ─────────────────────────────────────────────────────────────────────

export const CHAP_UNSUPPORTED = {
  reason: "CHAP is not supported (the platform does not store plaintext passwords). " +
    "Configure the NAS to use PAP or PEAP-MSCHAPv2.",
  classTag: "chap_unsupported",
} as const;
