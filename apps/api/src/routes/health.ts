// Liveness + readiness probes. /health/ready hits the DB.
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

const health: FastifyPluginAsync = async (app) => {
  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready", db: "ok" };
    } catch (err) {
      app.log.error({ err }, "readiness probe failed");
      return reply.status(503).send({ status: "not_ready", db: "fail" });
    }
  });
};

export default health;
