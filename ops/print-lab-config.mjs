#!/usr/bin/env node
/**
 * ops/print-lab-config.mjs
 *
 * Cross-platform lab configuration summary printer.
 * Works on Windows, macOS, and Linux — requires only Node ≥ 20.
 *
 * Usage:
 *   node ops/print-lab-config.mjs [options]
 *
 * Options:
 *   --server-ip <ip>     Override server IP (default: auto-detect)
 *   --nas-ip    <ip>     NAS / AP IP address
 *   --nas-secret <s>     NAS shared secret
 *   --api-url   <url>    API base URL   (default: http://localhost:4000)
 *   --dash-url  <url>    Dashboard URL  (default: http://localhost:5173)
 */

import { existsSync, readFileSync }  from "node:fs";
import { networkInterfaces }         from "node:os";
import { dirname, resolve, join }    from "node:path";
import { fileURLToPath }             from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");

// ── ANSI colours ──────────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const OPT_SERVER_IP  = arg("server-ip", "");
const OPT_NAS_IP     = arg("nas-ip",    process.env.SEED_LAB_NAS_IP    ?? "");
const OPT_NAS_SECRET = arg("nas-secret",process.env.SEED_LAB_NAS_SECRET ?? "");
const API_URL        = arg("api-url",   "http://localhost:4000");
const DASH_URL       = arg("dash-url",  "http://localhost:5173");

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function getLanIps() {
  const results = [];
  for (const [, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of (addrs ?? [])) {
      if (addr.family === "IPv4" && !addr.internal &&
          !addr.address.startsWith("127.") &&
          !addr.address.startsWith("169.254.")) {
        results.push(addr.address);
      }
    }
  }
  return results;
}

function kv(label, value) {
  const pad = 28;
  process.stdout.write(`  ${(label + ":").padEnd(pad)} ${value}\n`);
}

function section(title) {
  process.stdout.write(`\n${CYAN}${title}${RESET}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const rootEnv = readEnvFile(join(ROOT, ".env"));

const testUsername = process.env.SEED_TEST_USERNAME ?? "wifi-test";
const testPassword = process.env.SEED_TEST_USER_PASSWORD ?? "wifi12345!";

const lanIps      = getLanIps();
const serverIp    = OPT_SERVER_IP || lanIps[0] || "<pass --server-ip with your LAN address>";
const nasIp       = OPT_NAS_IP     || "<pass --nas-ip or set SEED_LAB_NAS_IP>";
const nasSecret   = OPT_NAS_SECRET || "<pass --nas-secret or set SEED_LAB_NAS_SECRET>";

const quarantineVlan = rootEnv.QUARANTINE_VLAN_ID || "<set QUARANTINE_VLAN_ID in .env>";
const normalVlan     = rootEnv.NORMAL_VLAN_ID     || "<set NORMAL_VLAN_ID in .env>";

process.stdout.write(`\n${BOLD}${GREEN}RadiusNexus — lab configuration summary${RESET}\n`);

section("Router / AP settings");
kv("RADIUS auth server",    serverIp);
kv("Authentication port",   "1812/udp");
kv("Accounting server",     serverIp);
kv("Accounting port",       "1813/udp");
kv("CoA / Disconnect port", "3799/udp");
kv("NAS / AP IP",           nasIp);
kv("Shared secret",         nasSecret);

section("Policy defaults");
kv("Quarantine VLAN", quarantineVlan);
kv("Normal VLAN fallback", normalVlan);
kv("Groups (VLAN)",
  "Staff→20  Family→30  Guest→99  (VLAN IDs match your AP/switch config)");

section("Bootstrap identities");
kv("PEAP test user",     testUsername);
kv("PEAP test password", testPassword);
kv("Admin dashboard",    DASH_URL);
kv("API readiness",      `${API_URL}/health/ready`);

if (lanIps.length > 1) {
  section("Detected server IPs");
  for (const ip of lanIps) {
    process.stdout.write(`  ${DIM}—${RESET} ${ip}\n`);
  }
  process.stdout.write("  Use the address your router can actually reach.\n");
}

section("Seed NAS row");
process.stdout.write(`  ${DIM}# Set env vars then run seed:${RESET}\n`);
if (process.platform === "win32") {
  process.stdout.write(`  $env:SEED_LAB_NAS_IP="<router-ip>"\n`);
  process.stdout.write(`  $env:SEED_LAB_NAS_SECRET="<radius-shared-secret>"\n`);
} else {
  process.stdout.write(`  export SEED_LAB_NAS_IP="<router-ip>"\n`);
  process.stdout.write(`  export SEED_LAB_NAS_SECRET="<radius-shared-secret>"\n`);
}
process.stdout.write(`  pnpm db:seed\n`);

section("Reminder");
process.stdout.write(
  "  Keep the server machine on Ethernet or a separate network\n" +
  "  while testing enterprise Wi-Fi.\n\n"
);
