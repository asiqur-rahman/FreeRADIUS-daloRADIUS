// ──────────────────────────────────────────────────────────────────────
//  User-level EAP-TLS client certificate issuance.
//
//  Issues a client cert signed by the platform CA.
//  The CA is loaded via the unified ca.ts service (DB → env → auto-gen).
//  The result is a one-time bundle; the private key is returned to the
//  caller and NEVER stored — only the fingerprint is persisted in DB.
//
//  Used by:
//    • /admin/users/:id/provision-cert  (admin provisions for a user)
//    • /me/certs/provision              (user self-provisions)
// ──────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { loadCa } from "./ca.js";
import { parseClientCertificatePem } from "./clientCertificates.js";
import { ServiceUnavailable } from "./errors.js";

export interface UserCertBundle {
  fingerprint:    string;
  commonName:     string;
  expiresAt:      Date;
  certificatePem: string;
  privateKeyPem:  string;
  pkcs12Base64:   string;
  pkcs12Password: string;
}

export function randomPkcs12Password(): string {
  return randomBytes(18).toString("base64url");
}

function escapeVal(v: string): string {
  return v.replace(/\r?\n/g, " ").trim();
}

async function runOpenSsl(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("openssl", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(ServiceUnavailable("OpenSSL not available"));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(ServiceUnavailable(stderr.trim() || "OpenSSL error"));
    });
  });
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(join(tmpdir(), "radius-user-cert-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function issueUserCert(args: {
  username: string;
  email: string | null;
  pkcs12Password?: string | null;
}): Promise<UserCertBundle> {
  const c = config();

  // Load CA from unified source (DB → env vars → auto-generate in dev)
  const ca = await loadCa({ throwIfMissing: true });
  if (!ca) throw ServiceUnavailable("CA unavailable");

  const commonName   = args.username.slice(0, 64);
  const pkcs12Pwd    = args.pkcs12Password?.trim() || randomPkcs12Password();
  const validityDays = c.DEVICE_CERT_VALIDITY_DAYS;

  return withTmpDir(async (dir) => {
    const caCertPath = join(dir, "ca.pem");
    const caKeyPath  = join(dir, "ca.key");
    const cfgPath    = join(dir, "req.cnf");
    const keyPath    = join(dir, "user.key");
    const csrPath    = join(dir, "user.csr");
    const certPath   = join(dir, "user.pem");
    const p12Path    = join(dir, "user.p12");
    const sanEmail   = args.email?.trim() ?? null;

    const cfgLines = [
      "[ req ]",
      "distinguished_name = dn",
      "prompt = no",
      "req_extensions = v3_req",
      "",
      "[ dn ]",
      `CN = ${escapeVal(commonName)}`,
      `O = ${escapeVal(c.DEVICE_CERT_SUBJECT_ORGANIZATION)}`,
      `OU = ${escapeVal(c.DEVICE_CERT_SUBJECT_ORGANIZATIONAL_UNIT)}`,
    ];
    if (c.DEVICE_CERT_SUBJECT_COUNTRY) cfgLines.push(`C = ${escapeVal(c.DEVICE_CERT_SUBJECT_COUNTRY.toUpperCase())}`);
    if (c.DEVICE_CERT_SUBJECT_STATE?.trim()) cfgLines.push(`ST = ${escapeVal(c.DEVICE_CERT_SUBJECT_STATE)}`);
    if (c.DEVICE_CERT_SUBJECT_LOCALITY?.trim()) cfgLines.push(`L = ${escapeVal(c.DEVICE_CERT_SUBJECT_LOCALITY)}`);
    if (sanEmail) cfgLines.push(`emailAddress = ${escapeVal(sanEmail)}`);

    cfgLines.push(
      "",
      "[ v3_req ]",
      "basicConstraints = critical,CA:FALSE",
      "keyUsage = critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage = clientAuth",
      "subjectKeyIdentifier = hash",
    );
    if (sanEmail) cfgLines.push(`subjectAltName = email:${escapeVal(sanEmail)}`);

    const env = {
      ...process.env,
      OPENSSL_CA_KEY_PASSPHRASE: ca.passphrase ?? "",
    };

    await Promise.all([
      fs.writeFile(caCertPath, ca.certPem, "utf8"),
      fs.writeFile(caKeyPath,  ca.keyPem,  "utf8"),
      fs.writeFile(cfgPath, cfgLines.join("\n"), "utf8"),
    ]);

    await runOpenSsl(["genrsa", "-out", keyPath, "2048"], dir, env);
    await runOpenSsl(["req", "-new", "-key", keyPath, "-out", csrPath, "-config", cfgPath], dir, env);

    const signArgs = [
      "x509", "-req", "-in", csrPath,
      "-CA", caCertPath, "-CAkey", caKeyPath, "-CAcreateserial",
      "-out", certPath, "-days", String(validityDays),
      "-sha256", "-extfile", cfgPath, "-extensions", "v3_req",
    ];
    if (ca.passphrase) signArgs.splice(8, 0, "-passin", "env:OPENSSL_CA_KEY_PASSPHRASE");
    await runOpenSsl(signArgs, dir, env);

    await runOpenSsl([
      "pkcs12", "-export",
      "-inkey", keyPath, "-in", certPath, "-certfile", caCertPath,
      "-out", p12Path, "-passout", `pass:${pkcs12Pwd}`,
    ], dir, env);

    const [certPemOut, keyPemOut, p12Buf] = await Promise.all([
      fs.readFile(certPath, "utf8"),
      fs.readFile(keyPath, "utf8"),
      fs.readFile(p12Path),
    ]);

    const parsed = parseClientCertificatePem(certPemOut);
    return {
      fingerprint:    parsed.fingerprint,
      commonName,
      expiresAt:      parsed.validTo ? new Date(parsed.validTo) : new Date(Date.now() + validityDays * 86_400_000),
      certificatePem: certPemOut,
      privateKeyPem:  keyPemOut,
      pkcs12Base64:   p12Buf.toString("base64"),
      pkcs12Password: pkcs12Pwd,
    };
  });
}
