// ─────────────────────────────────────────────────────────────────────
//  Entry point. Boots the UDP server, handles SIGINT/SIGTERM cleanly so
//  Prisma flushes and the socket releases the port.
// ─────────────────────────────────────────────────────────────────────

import { disconnect } from "./db.js";
import { log } from "./log.js";
import { createRadiusServer } from "./server.js";

async function main() {
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
