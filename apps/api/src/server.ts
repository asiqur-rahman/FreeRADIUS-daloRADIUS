// ─────────────────────────────────────────────────────────────────────
//  Fastify app builder. Kept separate from index.ts so tests can spin
//  up the app in-process without binding a port.
// ─────────────────────────────────────────────────────────────────────
import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";

import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import errorHandler from "./plugins/errorHandler.js";
import health from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import adminUserRoutes from "./routes/admin/users.js";
import adminGroupRoutes from "./routes/admin/groups.js";
import adminNasRoutes from "./routes/admin/nas.js";
import adminSiteRoutes from "./routes/admin/sites.js";
import adminCertRoutes from "./routes/admin/certs.js";
import meRoutes from "./routes/me.js";
import meDeviceRoutes from "./routes/meDevices.js";
import adminSessionRoutes from "./routes/admin/sessions.js";
import adminOperationRoutes from "./routes/admin/operations.js";
import mfaRoutes from "./routes/mfa.js";
import { Forbidden } from "./lib/errors.js";

export async function buildServer(opts: FastifyServerOptions = {}) {
  const c = config();
  const app = Fastify({
    logger: {
      level: c.LOG_LEVEL,
      transport:
        c.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
          : undefined,
    },
    trustProxy: true,
    ...opts,
  });

  // ── Core plugins ─────────────────────────────────────────────────
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: c.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: () => false,
  });
  await app.register(errorHandler);
  await app.register(authPlugin);
  app.addHook("preHandler", async (req) => {
    if (!["POST", "PATCH", "DELETE"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && !c.CORS_ORIGINS.includes(origin)) {
      throw Forbidden("Cross-origin state change rejected");
    }
  });

  // ── Routes ───────────────────────────────────────────────────────
  await app.register(health);
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(meRoutes);
      await api.register(meDeviceRoutes);
      await api.register(mfaRoutes);
      await api.register(adminUserRoutes, { prefix: "/admin" });
      await api.register(adminGroupRoutes, { prefix: "/admin" });
      await api.register(adminNasRoutes, { prefix: "/admin" });
      await api.register(adminSiteRoutes, { prefix: "/admin" });
      await api.register(adminCertRoutes, { prefix: "/admin" });
      await api.register(adminSessionRoutes, { prefix: "/admin" });
      await api.register(adminOperationRoutes, { prefix: "/admin" });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
