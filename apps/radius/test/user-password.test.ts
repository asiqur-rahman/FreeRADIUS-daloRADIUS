import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";

import { decryptUserPassword, encryptUserPassword } from "../src/protocol/user-password.js";

describe("PAP User-Password codec", () => {
  it("round-trips a short ASCII password", () => {
    const secret = "s3cret";
    const auth = randomBytes(16);
    const cipher = encryptUserPassword("hunter2", secret, auth);
    assert.equal(cipher.length, 16);
    assert.equal(decryptUserPassword(cipher, secret, auth), "hunter2");
  });

  it("round-trips a password that fills exactly one block", () => {
    const password = "0123456789abcdef"; // 16 chars
    const secret = "secret";
    const auth = randomBytes(16);
    const cipher = encryptUserPassword(password, secret, auth);
    assert.equal(cipher.length, 16);
    assert.equal(decryptUserPassword(cipher, secret, auth), password);
  });

  it("round-trips a long password spanning multiple blocks", () => {
    const password = "Long password used by very security-conscious users 12345!";
    const secret = "another-secret";
    const auth = randomBytes(16);
    const cipher = encryptUserPassword(password, secret, auth);
    assert.equal(cipher.length % 16, 0);
    assert.equal(decryptUserPassword(cipher, secret, auth), password);
  });

  it("round-trips a unicode password", () => {
    const password = "пassw𝟬rd-héllo-界";
    const secret = "secret";
    const auth = randomBytes(16);
    assert.equal(decryptUserPassword(encryptUserPassword(password, secret, auth), secret, auth), password);
  });

  it("rejects ciphertext with bad length", () => {
    const auth = randomBytes(16);
    assert.throws(() => decryptUserPassword(Buffer.alloc(15), "s", auth), /invalid length/);
    assert.throws(() => decryptUserPassword(Buffer.alloc(0), "s", auth), /invalid length/);
    assert.throws(() => decryptUserPassword(Buffer.alloc(129), "s", auth), /invalid length/);
  });

  it("decryption yields a different result under a different secret", () => {
    const auth = randomBytes(16);
    const cipher = encryptUserPassword("pw", "secret1", auth);
    const wrong = decryptUserPassword(cipher, "secret2", auth);
    assert.notEqual(wrong, "pw");
  });
});
