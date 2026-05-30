// ─────────────────────────────────────────────────────────────────────────────
//  Unified Certificate Authority service.
//
//  Single source of truth for the CA that signs all EAP-TLS client certs.
//  This is the same CA cert that gets distributed to devices so they can
//  trust the WiFi network.
//
//  Source priority (highest wins):
//    1. DB   — platform_settings keys ca.cert_pem / ca.key_pem
//              Configured via Admin → Settings → CA Certificate.
//    2. AUTO — self-signed CA generated once, saved to DB, and reused forever.
//              Works identically in dev and production.
//              Admin can replace it at any time via Admin → Settings → CA Certificate.
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from "node:fs";
import { spawn }          from "node:child_process";
import { tmpdir }         from "node:os";
import { join }           from "node:path";
import { X509Certificate } from "node:crypto";
import { prisma }         from "../db.js";
import { getCertSettings } from "./certSettings.js";
import { ServiceUnavailable } from "./errors.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CaSource = "db" | "auto";

export interface CaBundle {
  certPem:    string;
  keyPem:     string;
  passphrase: string | null;
  source:     CaSource;
}

export interface CaInfo {
  configured:  boolean;
  source:      CaSource | null;
  subject:     string | null;
  issuer:      string | null;
  expiresAt:   string | null;
  fingerprint: string | null;
}

// ── In-memory cache (CA changes are rare) ─────────────────────────────────────

let _cached: CaBundle | null = null;
let _cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 min

export function invalidateCaCache(): void {
  _cached = null;
  _cacheExpiry = 0;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadFromDb(): Promise<CaBundle | null> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ["ca.cert_pem", "ca.key_pem", "ca.key_passphrase"] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  if (!map["ca.cert_pem"]?.trim() || !map["ca.key_pem"]?.trim()) return null;
  return {
    certPem:    map["ca.cert_pem"],
    keyPem:     map["ca.key_pem"],
    passphrase: map["ca.key_passphrase"]?.trim() || null,
    source:     "db",
  };
}

// ── Auto-generation ───────────────────────────────────────────────────────────

function runOpenSsl(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("openssl", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? ServiceUnavailable("OpenSSL not found — cannot auto-generate CA")
          : err,
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(ServiceUnavailable(stderr.trim() || "OpenSSL error during CA generation"));
    });
  });
}

async function generateAndSaveCa(): Promise<CaBundle> {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), "radius-ca-"));

  try {
    const keyPath  = join(tmpDir, "ca.key");
    const certPath = join(tmpDir, "ca.pem");
    const cnfPath  = join(tmpDir, "ca.cnf");

    const certSettings = await getCertSettings();
    const cn  = "RadiusOps Auto CA";
    const org = certSettings.organization;
    const ou  = certSettings.organizationalUnit;

    await fs.writeFile(cnfPath, [
      "[req]",
      "distinguished_name = req_dn",
      "x509_extensions    = v3_ca",
      "prompt             = no",
      "",
      "[req_dn]",
      `CN  = ${cn}`,
      `O   = ${org}`,
      `OU  = ${ou}`,
      "",
      "[v3_ca]",
      "basicConstraints       = critical, CA:true",
      "keyUsage               = critical, keyCertSign, cRLSign, digitalSignature",
      "subjectKeyIdentifier   = hash",
      "authorityKeyIdentifier = keyid:always, issuer",
    ].join("\n"), "utf8");

    const env = { ...process.env };

    await runOpenSsl(["genrsa", "-out", keyPath, "4096"], env);
    await runOpenSsl([
      "req", "-new", "-x509",
      "-key",    keyPath,
      "-out",    certPath,
      "-days",   "3650",      // 10 years for the CA
      "-config", cnfPath,
    ], env);

    const certPem = await fs.readFile(certPath, "utf8");
    const keyPem  = await fs.readFile(keyPath,  "utf8");

    // Persist to DB so it survives restarts
    await saveCaToDB(certPem, keyPem, null);

    console.info(
      "[ca] Auto-generated CA and saved to platform_settings. " +
      "You can replace it at any time via Admin → Settings → CA Certificate.",
    );

    return { certPem, keyPem, passphrase: null, source: "auto" };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function saveCaToDB(
  certPem: string,
  keyPem: string,
  passphrase: string | null,
): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.platformSetting.upsert({
      where:  { key },
      create: { key, value },
      update: { value },
    });
  await Promise.all([
    upsert("ca.cert_pem", certPem.trim()),
    upsert("ca.key_pem",  keyPem.trim()),
    upsert("ca.key_passphrase", passphrase?.trim() ?? ""),
  ]);
  invalidateCaCache();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load the CA bundle.
 * If no CA is in the database, auto-generates one, saves it, and returns it.
 * The auto-generated CA is reused on every subsequent call (DB-backed).
 * Admin can replace it at any time via Admin → Settings → CA Certificate.
 */
export async function loadCa(): Promise<CaBundle> {
  if (_cached && Date.now() < _cacheExpiry) return _cached;

  const db = await loadFromDb();
  if (db) { _cached = db; _cacheExpiry = Date.now() + CACHE_TTL; return db; }

  const auto = await generateAndSaveCa();
  _cached = auto; _cacheExpiry = Date.now() + CACHE_TTL;
  return auto;
}

/** Parse cert metadata for admin display — never exposes the private key. */
export async function getCaInfo(): Promise<CaInfo> {
  const ca = await loadCa();

  try {
    const x509 = new X509Certificate(ca.certPem);
    return {
      configured:  true,
      source:      ca.source,
      subject:     x509.subject,
      issuer:      x509.issuer,
      expiresAt:   x509.validTo,
      fingerprint: x509.fingerprint256,
    };
  } catch {
    return {
      configured:  true,
      source:      ca.source,
      subject:     null,
      issuer:      null,
      expiresAt:   null,
      fingerprint: null,
    };
  }
}
