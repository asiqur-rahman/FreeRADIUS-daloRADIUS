#!/usr/bin/env node
/**
 * ops/generate-certs.mjs
 *
 * Cross-platform wrapper for certificate generation.
 * On Linux / macOS: runs infra/freeradius/generate-certs.sh directly.
 * On Windows: runs the script inside a Docker container (so you never
 *             need bash on Windows — Docker is sufficient).
 *
 * Usage:
 *   pnpm certs:generate
 *   node ops/generate-certs.mjs
 */

import { execSync, spawnSync }      from "node:child_process";
import { existsSync }               from "node:fs";
import { platform }                 from "node:os";
import { dirname, resolve, join }   from "node:path";
import { fileURLToPath }            from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const SCRIPT    = join(ROOT, "infra/freeradius/generate-certs.sh");

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";
const BOLD   = "\x1b[1m";

function die(msg) { process.stderr.write(`${RED}${BOLD}✗ ${msg}${RESET}\n`); process.exit(1); }
function ok(msg)  { process.stdout.write(`${GREEN}✓ ${msg}${RESET}\n`); }
function info(msg){ process.stdout.write(`${CYAN}  ${msg}${RESET}\n`); }

process.stdout.write(`\n${BOLD}RadiusNexus — EAP certificate generator${RESET}\n\n`);

if (!existsSync(SCRIPT)) die(`Script not found: ${SCRIPT}`);

const os = platform();

if (os === "linux" || os === "darwin") {
  // Native bash available
  info("Platform: Unix — running bash script directly");
  const result = spawnSync("bash", [SCRIPT], {
    stdio: "inherit",
    env:   process.env,
    cwd:   ROOT,
  });
  if (result.status !== 0) die("Certificate generation failed.");
  ok("Certificates generated.");

} else if (os === "win32") {
  // Windows — use Docker if available, else try Git Bash / WSL
  info("Platform: Windows");

  // 1. Try Docker (preferred — no bash install needed)
  const dockerOk = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
  if (dockerOk) {
    info("Using Docker to run bash script…");
    // Mount repo root into alpine and run the script
    const certDir = join(ROOT, "infra/freeradius/raddb/certs").replace(/\\/g, "/");
    const hostPath = ROOT.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1");
    const result = spawnSync(
      "docker",
      [
        "run", "--rm",
        "-v", `${ROOT}:/repo`,
        "-e", `RADIUS_CERT_CN=${process.env.RADIUS_CERT_CN ?? "radius.local"}`,
        "alpine/openssl",
        "sh", "-c",
        "apk add --no-cache bash openssl >/dev/null 2>&1 && bash /repo/infra/freeradius/generate-certs.sh",
      ],
      { stdio: "inherit", cwd: ROOT },
    );
    if (result.status !== 0) die("Docker cert generation failed.");
    ok("Certificates generated via Docker.");
    process.exit(0);
  }

  // 2. Try Git Bash
  const gitBashPaths = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const bash of gitBashPaths) {
    if (!existsSync(bash)) continue;
    info(`Using Git Bash: ${bash}`);
    const result = spawnSync(bash, [SCRIPT], { stdio: "inherit", env: process.env, cwd: ROOT });
    if (result.status !== 0) die("Certificate generation failed.");
    ok("Certificates generated.");
    process.exit(0);
  }

  // 3. Try WSL
  const wsl = spawnSync("wsl.exe", ["bash", "-lc", `bash "${SCRIPT}"`], {
    stdio: "inherit",
    env:   process.env,
    cwd:   ROOT,
  });
  if (wsl.status === 0) {
    ok("Certificates generated via WSL.");
    process.exit(0);
  }

  die(
    "Could not run certificate generation on Windows.\n\n" +
    "  Option A (recommended): Docker Desktop\n" +
    "    docker is available but not running — start Docker Desktop\n\n" +
    "  Option B: Git for Windows\n" +
    "    https://git-scm.com — provides Git Bash\n\n" +
    "  Option C: WSL 2\n" +
    "    wsl --install  (then re-run this script)\n\n" +
    "  The FreeRADIUS container also auto-generates certs at startup if none exist.\n" +
    "  You can skip this step and just run: docker compose up -d\n"
  );
} else {
  die(`Unsupported platform: ${os}`);
}
