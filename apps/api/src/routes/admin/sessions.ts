import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";
import { disconnectSession, disconnectUserSessions, listSessions } from "../../services/sessions.js";

const ListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  active: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().default(true)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const DisconnectBody = z.object({
  reason: z.string().trim().max(200).optional(),
});

const adminSessions: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  app.get("/sessions", async (req) => {
    const q = ListQuery.parse(req.query);
    return listSessions({ activeOnly: q.active, q: q.q, page: q.page, pageSize: q.pageSize });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/disconnect", async (req) => {
    const body = DisconnectBody.parse(req.body ?? {});
    const attempt = await disconnectSession(req.params.id);
    await audit({
      actorId: req.currentUser!.sub,
      action: "user_disconnect",
      targetType: "session",
      targetId: attempt.sessionId,
      metadata: {
        event: "session.disconnect",
        ...(body.reason ? { reason: body.reason } : {}),
        result: { ...attempt.result },
      },
      req,
    });
    return { ok: attempt.result.acknowledged, ...attempt };
  });

  app.post<{ Params: { id: string } }>("/users/:id/disconnect", async (req) => {
    const body = DisconnectBody.parse(req.body ?? {});
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw NotFound("User not found");
    const attempts = await disconnectUserSessions(user.username);
    const ok = attempts.every((attempt) => attempt.result.acknowledged);
    await audit({
      actorId: req.currentUser!.sub,
      action: "user_disconnect",
      targetType: "user",
      targetId: user.id,
      metadata: {
        event: "user.disconnect",
        ...(body.reason ? { reason: body.reason } : {}),
        attempts: attempts.map((attempt) => ({
          sessionId: attempt.sessionId,
          result: { ...attempt.result },
        })),
      },
      req,
    });
    return { ok, attempted: attempts.length, attempts };
  });
};

export default adminSessions;
