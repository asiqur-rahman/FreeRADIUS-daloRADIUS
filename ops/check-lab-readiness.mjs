#!/usr/bin/env node
/**
 * ops/check-lab-readiness.mjs
 *
 * Cross-platform lab readiness checker.
 * Works on Windows, macOS, and Linux — requires only Node ≥ 20.
 *
 * Usage:
 *   node ops/check-lab-readiness.mjs [options]
 *
 * Options:
 *   --api-url  <url>   API base URL (default: http://localhost:4000)
 *   --web-url  <url>   Web base URL (default: http://localhost:8123)
 */

import { execSync, spawnSync }         from "node:child_process";
import { existsSync, readFileSync }    from "node:fs";
import { createConnection }            from "node:net";
import { platform }                    from "node:os";
import { dirname, resolve, join }      from "node:path";
import { fileURLToPath }               from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");

// ── ANSI colours ──────────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const API_URL = arg("api-url", "http://localhost:4000");
const WEB_URL = arg("web-url", "http://localhost:8123");

// ── Helpers ───────────────────────────────────────────────────────────────────
let failures = 0;

function check(status, name, detail) {
  const color = status === "PASS" ? GREEN : status === "WARN" ? YELLOW : RED;
  process.stdout.write(`${color}[${status}]${RESET} ${name} — ${detail}\n`);
  if (status === "FAIL") failures++;
}

function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.replace(/^﻿/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val    = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, "").trim();
    }
    values[key] = val;
  }
  return values;
}

function tcpOpen(host, port) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: 1500 });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error",   () => { resolve(false); });
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
  });
}

async function httpGet(url) {
  try {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!resp.ok) return null;
    return resp.json().catch(() => null);
  } catch {
    return null;
  }
}

function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 10000, ...opts });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function commandExists(name) {
  const which = platform() === "win32" ? "where" : "which";
  return run(which, [name]).ok;
}

function dockerNative() {
  return run("docker", ["--version"]).ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────

process.stdout.write(`\n${BOLD}${CYAN}RadiusOps — lab readiness check${RESET}\n\n`);

const rootEnv = readEnvFile(join(ROOT, ".env"));
const apiEnv  = readEnvFile(join(ROOT, "apps/api/.env"));

// ── .env files ────────────────────────────────────────────────────────────────
for (const p of [".env", "apps/api/.env"]) {
  const full = join(ROOT, p);
  existsSync(full) ? check("PASS", p, "found") : check("FAIL", p, "missing");
}

// ── Required root env keys ────────────────────────────────────────────────────
const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "MFA_ENCRYPTION_KEY",
  "RADIUS_HOOK_SECRET",
];
for (const key of required) {
  rootEnv[key]
    ? check("PASS", `env:${key}`, "set")
    : check("FAIL", `env:${key}`, "missing in .env");
}

// ── Telegram ──────────────────────────────────────────────────────────────────
const tgConfigured = (rootEnv.TELEGRAM_BOT_TOKEN || apiEnv.TELEGRAM_BOT_TOKEN) &&
                     (rootEnv.TELEGRAM_ADMIN_CHAT_ID || apiEnv.TELEGRAM_ADMIN_CHAT_ID);
tgConfigured
  ? check("PASS",  "Telegram", "bot token + admin chat id configured")
  : check("WARN",  "Telegram", "not configured — configurable from admin panel");

// ── Device CA (EAP-TLS) ───────────────────────────────────────────────────────
// CA is DB-backed and configured via Admin → Settings → CA Certificate.
// In dev mode (NODE_ENV=development) it auto-generates on first cert issuance.
check("INFO", "Device CA (EAP-TLS)", "configure via Admin → Settings → CA Certificate");

// ── OpenSSL ───────────────────────────────────────────────────────────────────
commandExists("openssl")
  ? check("PASS", "OpenSSL CLI", "found in PATH")
  : check("WARN", "OpenSSL CLI", "missing — needed for dashboard-issued client certs");

// ── Docker ────────────────────────────────────────────────────────────────────
if (dockerNative()) {
  const vr = run("docker", ["--version"]);
  check("PASS", "Docker", vr.stdout.trim());

  // Running services via docker compose
  const ps = run("docker", ["compose", "ps", "--services", "--status", "running"]);
  if (ps.ok) {
    const running = ps.stdout.trim().split("\n").filter(Boolean);
    for (const svc of ["postgres", "freeradius"]) {
      running.includes(svc)
        ? check("PASS", `docker:${svc}`, "running")
        : check("WARN", `docker:${svc}`, "not running via docker compose");
    }
  }
} else {
  check("FAIL", "Docker", "docker CLI not found in PATH");
}

// ── API readiness ─────────────────────────────────────────────────────────────
const apiHealth = await httpGet(`${API_URL}/health/ready`);
apiHealth?.status === "ready"
  ? check("PASS", "API readiness", `${API_URL}/health/ready`)
  : check("WARN", "API readiness", `API not responding at ${API_URL}`);

// ── Web health ────────────────────────────────────────────────────────────────
const webHealth = await httpGet(`${WEB_URL}/web-health`).catch(() => null);
webHealth !== null
  ? check("PASS", "Web health", `${WEB_URL}/web-health`)
  : check("WARN", "Web health", `web container not responding at ${WEB_URL}`);

// ── Prisma migration status ───────────────────────────────────────────────────
const prismaCandidates = [
  join(ROOT, "apps/api/node_modules/prisma/build/index.js"),
  join(ROOT, "node_modules/prisma/build/index.js"),
];
const prismaPath = prismaCandidates.find(existsSync);
if (prismaPath) {
  const schema = join(ROOT, "apps/api/prisma/schema.prisma");
  const pr = run("node", [prismaPath, "migrate", "status", "--schema", schema], {
    env: { ...process.env, DATABASE_URL: rootEnv.DATABASE_URL ?? process.env.DATABASE_URL },
  });
  pr.ok
    ? check("PASS", "Prisma migrations", "up to date")
    : check("FAIL", "Prisma migrations",
        pr.stderr.split("\n").find((l) => l.trim() && !l.match(/loaded from|variables loaded/))?.trim()
        ?? "migrate status failed");
} else {
  check("WARN", "Prisma migrations", "prisma CLI not found — run pnpm install first");
}

// ── Summary ───────────────────────────────────────────────────────────────────
process.stdout.write("\n");
if (failures > 0) {
  process.stdout.write(`${RED}${BOLD}Lab readiness failed with ${failures} blocking issue(s).${RESET}\n`);
  process.exit(1);
} else {
  process.stdout.write(`${GREEN}${BOLD}Lab readiness passed.${RESET} Remaining WARN items are optional.\n`);
}
