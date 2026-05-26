// ─────────────────────────────────────────────────────────────────────
//  Entry point. Boots the UDP server, handles SIGINT/SIGTERM cleanly so
//  Prisma flushes and the socket releases the port.
// ─────────────────────────────────────────────────────────────────────

import { createHash, createCipheriv } from "node:crypto";
import { disconnect } from "./db.js";
import { log } from "./log.js";
import { createRadiusServer } from "./server.js";
import { config } from "./config.js";

/**
 * Verify Node's OpenSSL legacy provider is available before we accept
 * any auth traffic. MSCHAPv2 (MD4) and PEAP/EAP-TLS (single-DES inside
 * MSCHAPv2 challenge response) both require it. The radius scripts in
 * package.json pass `--openssl-legacy-provider`, but anything bypassing
 * those scripts (operator running `node dist/index.js` directly, an
 * unusual systemd unit, a Docker rebuild that omits the flag) would
 * silently break MSCHAPv2 authentication.
 *
 * Fail loud at startup rather than letting every auth attempt error.
 */
function assertLegacyCryptoAvailable(): void {
  try {
    createHash("md4").update("test").digest();
  } catch {
    log.fatal(
      "MD4 not available — Node was started without --openssl-legacy-provider. " +
        "MSCHAPv2 / PEAP / EAP-TLS will not work. Add the flag and restart.",
    );
    process.exit(2);
  }
  try {
    const cipher = createCipheriv("des-ecb", Buffer.alloc(8), null);
    cipher.setAutoPadding(false);
    cipher.update(Buffer.alloc(8));
    cipher.final();
  } catch {
    log.fatal(
      "DES-ECB not available — Node was started without --openssl-legacy-provider. " +
        "MSCHAPv2 challenge-response will not work. Add the flag and restart.",
    );
    process.exit(2);
  }
}

/**
 * Print a one-line summary of which auth methods will be offered.
 * Operators can grep for this in logs to confirm config without
 * trawling for individual env vars.
 */
function logBootBanner(): void {
  const c = config();
  const methods: string[] = [];
  if (c.EAP_TLS_ENABLED) methods.push("EAP-TLS");
  if (c.PEAP_ENABLED) methods.push("PEAP-MSCHAPv2");
  // Direct (non-EAP) methods are always available; EAP-MSCHAPv2 is the
  // default EAP method when neither PEAP nor EAP-TLS is enabled.
  if (methods.length === 0) methods.push("EAP-MSCHAPv2 (direct)");
  methods.push("PAP", "MSCHAPv2 (direct)");

  log.info(
    {
      env: c.NODE_ENV,
      methods,
      authPort: c.RADIUS_AUTH_PORT,
      acctPort: c.RADIUS_ACCT_PORT,
      coaPort: c.RADIUS_COA_PORT,
      tlsCertConfigured: Boolean(c.TLS_CERT_PATH && c.TLS_KEY_PATH),
      requireMsgAuth: c.REQUIRE_MESSAGE_AUTHENTICATOR,
    },
    "radius.boot",
  );
}

async function main() {
  assertLegacyCryptoAvailable();
  logBootBanner();
  const server = createRadiusServer();
  await server.listen();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "radius.shutdown_begin");
    try {
      await server.close();
      await disconnect();
    } catch (err) {
      log.error({ err }, "radius.shutdown_error");
    } finally {
      log.info("radius.shutdown_complete");
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("unhandledRejection", (reason) => {
    log.error({ reason }, "radius.unhandled_rejection");
  });
  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "radius.uncaught_exception");
    process.exit(1);
  });
}

main().catch((err) => {
  log.fatal({ err }, "radius.bootstrap_failed");
  process.exit(1);
});
