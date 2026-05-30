import "./loadAppEnv.js";
// Entry point: build the server and listen.
import { buildServer } from "./server.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startTelegramPolling, stopTelegramPolling } from "./lib/telegram.js";

async function main() {
  const c = config();
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      stopTelegramPolling();
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "shutdown error");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: c.API_HOST, port: c.API_PORT });
  // Start polling after listen so DB is fully ready and settings can be read.
  startTelegramPolling();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
