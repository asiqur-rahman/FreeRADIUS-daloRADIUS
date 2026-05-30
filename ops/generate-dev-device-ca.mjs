#!/usr/bin/env node
/**
 * ops/generate-dev-device-ca.mjs
 *
 * Cross-platform device CA generator for local development.
 * Works on Windows, macOS, and Linux — requires only Node ≥ 20 and OpenSSL in PATH.
 *
 * Generates a CA key+cert and saves them to --out-dir (default: ops/dev-ca/).
 * Upload the result to the admin panel: Admin → Settings → CA Certificate.
 *
 * OpenSSL ships with:
 *   • Linux   — system package manager  (apt install openssl / dnf install openssl)
 *   • macOS   — Homebrew (brew install openssl) or system LibreSSL
 *   • Windows — Git for Windows (https://git-scm.com) includes openssl.exe in usr/bin
 *
 * Usage:
 *   node ops/generate-dev-device-ca.mjs [options]
 *
 * Options:
 *   --out-dir   <path>   Output directory  (default: ops/dev-ca)
 *   --cn        <string> Certificate CN   (default: "RadiusOps Dev Device CA")
 *   --org       <string> Organisation     (default: "RadiusOps")
 *   --ou        <string> Org unit         (default: "Managed WiFi")
 *   --key-bits  <n>      RSA key size     (default: 2048)
 *   --days      <n>      Validity in days (default: 1825 = 5 years)
 *   --force              Overwrite existing files
 */

import { execSync }                                  from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync,
         readFileSync, rmSync, writeFileSync }       from "node:fs";
import { tmpdir, platform }                          from "node:os";
import { dirname, join, resolve }                    from "node:path";
import { fileURLToPath }                             from "node:url";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── CLI argument parsing ──────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
function flag(name) { return argv.includes(`--${name}`); }

const OUT_DIR   = resolve(ROOT, arg("out-dir",  "ops/dev-ca"));
const CN        = arg("cn",       "RadiusOps Dev Device CA");
const ORG       = arg("org",      "RadiusOps");
const OU        = arg("ou",       "Managed WiFi");
const KEY_BITS  = parseInt(arg("key-bits", "2048"), 10);
const DAYS      = parseInt(arg("days",     String(5 * 365)), 10);
const FORCE     = flag("force");

// ── Find OpenSSL ──────────────────────────────────────────────────────────────

function findOpenSSL() {
  // 1. Try whatever is in PATH first (works on Linux, macOS, and Windows if
  //    openssl.exe is on the system PATH or Git\usr\bin is in PATH).
  for (const candidate of ["openssl", "openssl3"]) {
    try {
      execSync(`${candidate} version`, { stdio: "ignore" });
      return candidate;
    } catch { /* not found at this name */ }
  }

  // 2. Windows — probe common installation paths.
  if (platform() === "win32") {
    const winCandidates = [
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
      "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
      "C:\\ProgramData\\chocolatey\\bin\\openssl.exe",
      "C:\\OpenSSL-Win64\\bin\\openssl.exe",
      "C:\\OpenSSL-Win32\\bin\\openssl.exe",
      "C:\\Windows\\System32\\openssl.exe",
    ];
    for (const p of winCandidates) {
      if (!existsSync(p)) continue;
      try {
        execSync(`"${p}" version`, { stdio: "ignore" });
        return `"${p}"`;          // wrap in quotes to handle spaces
      } catch { /* bad binary */ }
    }
  }

  // 3. macOS — Homebrew prefix variants.
  if (platform() === "darwin") {
    for (const prefix of ["/opt/homebrew/opt/openssl@3/bin", "/usr/local/opt/openssl@3/bin", "/usr/local/opt/openssl/bin"]) {
      const p = join(prefix, "openssl");
      if (!existsSync(p)) continue;
      try {
        execSync(`"${p}" version`, { stdio: "ignore" });
        return `"${p}"`;
      } catch { /* bad binary */ }
    }
  }

  die(
    "OpenSSL not found.\n\n" +
    "  Linux  : sudo apt install openssl   (or dnf / pacman / apk install openssl)\n" +
    "  macOS  : brew install openssl\n" +
    "  Windows: install Git for Windows → https://git-scm.com  (includes openssl.exe)\n" +
    "           or Chocolatey: choco install openssl\n"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

process.stdout.write(`\n${BOLD}RadiusOps — Device CA Generator${RESET}\n\n`);

const openssl = findOpenSSL();
info(`OpenSSL: ${execSync(`${openssl} version`, { encoding: "utf8" }).trim()}`);
info(`Platform: ${process.platform} / Node ${process.version}`);
process.stdout.write("\n");

// Output paths
mkdirSync(OUT_DIR, { recursive: true });
const certFile = join(OUT_DIR, "device-ca.pem");
const keyFile  = join(OUT_DIR, "device-ca.key");

if (!FORCE) {
  if (existsSync(certFile)) die(`File exists: ${certFile}\n  Use --force to overwrite.`);
  if (existsSync(keyFile))  die(`File exists: ${keyFile}\n  Use --force to overwrite.`);
}

// Temporary directory for the OpenSSL config (cleaned up in finally block)
const tmpDir = mkdtempSync(join(tmpdir(), "radius-ca-"));
const cnfFile = join(tmpDir, "ca.cnf");

// Build subject — skip empty fields
const subjectParts = [`CN=${CN}`];
if (ORG.trim())  subjectParts.push(`O=${ORG}`);
if (OU.trim())   subjectParts.push(`OU=${OU}`);
const subject = "/" + subjectParts.join("/");

writeFileSync(cnfFile, [
  "[req]",
  "distinguished_name = req_dn",
  "x509_extensions    = v3_ca",
  "prompt             = no",
  "",
  "[req_dn]",
  `CN  = ${CN}`,
  ORG.trim() ? `O   = ${ORG}` : null,
  OU.trim()  ? `OU  = ${OU}`  : null,
  "",
  "[v3_ca]",
  "basicConstraints       = critical, CA:true",
  "keyUsage               = critical, keyCertSign, cRLSign, digitalSignature",
  "subjectKeyIdentifier   = hash",
  "authorityKeyIdentifier = keyid:always, issuer",
].filter((l) => l !== null).join("\n") + "\n");

try {
  // 1. RSA private key — intentionally unencrypted; FreeRADIUS requires it.
  info(`Generating RSA-${KEY_BITS} private key…`);
  execSync(`${openssl} genrsa -out "${keyFile}" ${KEY_BITS}`, { stdio: "pipe" });
  ok(`Key  → ${keyFile}`);

  // 2. Self-signed CA certificate.
  info(`Signing CA certificate (${DAYS} days)…`);
  execSync(
    `${openssl} req -new -x509` +
    ` -key "${keyFile}"` +
    ` -out "${certFile}"` +
    ` -days ${DAYS}` +
    ` -config "${cnfFile}"`,
    { stdio: "pipe" },
  );
  ok(`Cert → ${certFile}`);

  // 3. Quick sanity check — verify the cert reads back correctly.
  const verify = execSync(`${openssl} x509 -in "${certFile}" -noout -subject -dates`, { encoding: "utf8" });
  for (const line of verify.trim().split("\n")) {
    info(line.trim());
  }
  process.stdout.write("\n");

} catch (err) {
  const msg = err.stderr ? err.stderr.toString() : String(err);
  die(`OpenSSL command failed:\n${msg}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

// 4. Copy output files to OUT_DIR
mkdirSync(OUT_DIR, { recursive: true });
const outCert = join(OUT_DIR, "ca.pem");
const outKey  = join(OUT_DIR, "ca.key");

if (!FORCE && (existsSync(outCert) || existsSync(outKey))) {
  warn(`Output files already exist in ${OUT_DIR} — use --force to overwrite.`);
} else {
  writeFileSync(outCert, readFileSync(certFile));
  writeFileSync(outKey,  readFileSync(keyFile));
  ok(`CA certificate  →  ${outCert}`);
  ok(`CA private key  →  ${outKey}`);
}

process.stdout.write(`\n${BOLD}Done.${RESET}\n\n`);
process.stdout.write(`Next step — upload the CA to the admin panel:\n\n`);
process.stdout.write(`  1. Open the admin dashboard\n`);
process.stdout.write(`  2. Go to  ${CYAN}Admin → Settings → CA Certificate${RESET}\n`);
process.stdout.write(`  3. Paste the contents of ${CYAN}${outCert}${RESET}  into "CA Certificate"\n`);
process.stdout.write(`  4. Paste the contents of ${CYAN}${outKey}${RESET}   into "CA Private Key"\n`);
process.stdout.write(`  5. Click Save\n\n`);
process.stdout.write(`Or, if you just want auto-generated certs, click "Generate" in the admin panel — no script needed.\n\n`);
