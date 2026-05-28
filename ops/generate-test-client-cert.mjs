#!/usr/bin/env node
/**
 * ops/generate-test-client-cert.mjs
 *
 * Cross-platform EAP-TLS test client certificate generator.
 * Works on Windows, macOS, and Linux — requires Node ≥ 20 and OpenSSL in PATH.
 *
 * Usage:
 *   pnpm lab:client-cert
 *   node ops/generate-test-client-cert.mjs [options]
 *
 * Options:
 *   --out-dir    <path>   Output directory  (default: ops/dev-ca/clients)
 *   --ca-cert    <path>   CA cert PEM       (default: ops/dev-ca/device-ca.pem)
 *   --ca-key     <path>   CA key PEM        (default: ops/dev-ca/device-ca.key)
 *   --cn         <name>   Subject CN        (default: test-device)
 *   --days       <n>      Validity in days  (default: 365)
 *   --key-bits   <n>      RSA key size      (default: 2048)
 *   --force              Overwrite existing files
 */

import { execSync }                                  from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync,
         readFileSync, rmSync, writeFileSync }       from "node:fs";
import { tmpdir, platform }                          from "node:os";
import { dirname, join, resolve }                    from "node:path";
import { fileURLToPath }                             from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const BOLD   = "\x1b[1m";

function info(msg)  { process.stdout.write(`${CYAN}  ${msg}${RESET}\n`); }
function ok(msg)    { process.stdout.write(`${GREEN}✓ ${msg}${RESET}\n`); }
function warn(msg)  { process.stderr.write(`${YELLOW}⚠ ${msg}${RESET}\n`); }
function die(msg)   { process.stderr.write(`${RED}${BOLD}✗ ${msg}${RESET}\n`); process.exit(1); }

// ── CLI parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
function flag(name) { return argv.includes(`--${name}`); }

const OUT_DIR   = resolve(ROOT, arg("out-dir",  "ops/dev-ca/clients"));
const CA_CERT   = resolve(ROOT, arg("ca-cert",  "ops/dev-ca/device-ca.pem"));
const CA_KEY    = resolve(ROOT, arg("ca-key",   "ops/dev-ca/device-ca.key"));
const CN        = arg("cn",       "test-device");
const KEY_BITS  = parseInt(arg("key-bits", "2048"), 10);
const DAYS      = parseInt(arg("days",     "365"),  10);
const FORCE     = flag("force");

// ── Find OpenSSL (reuse logic from generate-dev-device-ca.mjs) ───────────────
function findOpenSSL() {
  for (const c of ["openssl", "openssl3"]) {
    try { execSync(`${c} version`, { stdio: "ignore" }); return c; } catch { /**/ }
  }
  if (platform() === "win32") {
    for (const p of [
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
      "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
      "C:\\ProgramData\\chocolatey\\bin\\openssl.exe",
      "C:\\OpenSSL-Win64\\bin\\openssl.exe",
      "C:\\Windows\\System32\\openssl.exe",
    ]) {
      if (!existsSync(p)) continue;
      try { execSync(`"${p}" version`, { stdio: "ignore" }); return `"${p}"`; } catch { /**/ }
    }
  }
  if (platform() === "darwin") {
    for (const prefix of ["/opt/homebrew/opt/openssl@3/bin", "/usr/local/opt/openssl@3/bin"]) {
      const p = join(prefix, "openssl");
      if (!existsSync(p)) continue;
      try { execSync(`"${p}" version`, { stdio: "ignore" }); return `"${p}"`; } catch { /**/ }
    }
  }
  die("OpenSSL not found.\n  Linux: sudo apt install openssl\n  macOS: brew install openssl\n  Windows: install Git for Windows (https://git-scm.com)");
}

// ── Main ──────────────────────────────────────────────────────────────────────
process.stdout.write(`\n${BOLD}RadiusNexus — Test Client Certificate Generator${RESET}\n\n`);

if (!existsSync(CA_CERT)) die(`CA cert not found: ${CA_CERT}\n  Run: pnpm lab:device-ca`);
if (!existsSync(CA_KEY))  die(`CA key  not found: ${CA_KEY}\n  Run: pnpm lab:device-ca`);

const openssl = findOpenSSL();
info(`OpenSSL: ${execSync(`${openssl} version`, { encoding: "utf8" }).trim()}`);

mkdirSync(OUT_DIR, { recursive: true });

const keyFile  = join(OUT_DIR, `${CN}.key`);
const csrFile  = join(OUT_DIR, `${CN}.csr`);
const certFile = join(OUT_DIR, `${CN}.pem`);
const p12File  = join(OUT_DIR, `${CN}.p12`);

if (!FORCE) {
  if (existsSync(certFile)) die(`File exists: ${certFile}\n  Use --force to overwrite.`);
}

const tmpDir  = mkdtempSync(join(tmpdir(), "radius-cert-"));
const extFile = join(tmpDir, "client.ext");
const serFile = join(tmpDir, "serial.txt");

writeFileSync(extFile, [
  "[client]",
  "basicConstraints = CA:FALSE",
  "keyUsage = critical, digitalSignature, keyEncipherment",
  "extendedKeyUsage = clientAuth",
  "subjectKeyIdentifier = hash",
  "authorityKeyIdentifier = keyid,issuer",
].join("\n") + "\n");

writeFileSync(serFile, Date.now().toString(16).toUpperCase());

try {
  info(`Generating RSA-${KEY_BITS} client key…`);
  execSync(`${openssl} genrsa -out "${keyFile}" ${KEY_BITS}`, { stdio: "pipe" });
  ok(`Key  → ${keyFile}`);

  info("Creating CSR…");
  execSync(
    `${openssl} req -new -key "${keyFile}" -out "${csrFile}" -subj "/CN=${CN}"`,
    { stdio: "pipe" },
  );
  ok(`CSR  → ${csrFile}`);

  info(`Signing certificate (${DAYS} days)…`);
  execSync(
    `${openssl} x509 -req` +
    ` -in "${csrFile}"` +
    ` -CA "${CA_CERT}"` +
    ` -CAkey "${CA_KEY}"` +
    ` -set_serial 0x${readFileSync(serFile, "utf8").trim()}` +
    ` -days ${DAYS}` +
    ` -extfile "${extFile}"` +
    ` -extensions client` +
    ` -out "${certFile}"`,
    { stdio: "pipe" },
  );
  ok(`Cert → ${certFile}`);

  // PKCS#12 bundle (for Android / Windows import)
  info("Building PKCS#12 bundle (no password)…");
  execSync(
    `${openssl} pkcs12 -export` +
    ` -in "${certFile}"` +
    ` -inkey "${keyFile}"` +
    ` -CAfile "${CA_CERT}"` +
    ` -out "${p12File}"` +
    ` -passout pass:`,
    { stdio: "pipe" },
  );
  ok(`.p12 → ${p12File}`);

  const verify = execSync(`${openssl} x509 -in "${certFile}" -noout -subject -dates`, { encoding: "utf8" });
  for (const line of verify.trim().split("\n")) info(line.trim());

} catch (err) {
  const msg = err.stderr ? err.stderr.toString() : String(err);
  die(`OpenSSL command failed:\n${msg}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

process.stdout.write(`\n${BOLD}Done.${RESET}\n`);
process.stdout.write(`  ${CYAN}Import ${CN}.p12 on your test device to use EAP-TLS.${RESET}\n\n`);
process.stdout.write(`  Import the CA (ops/dev-ca/device-ca.pem) as a trusted root first.\n\n`);
