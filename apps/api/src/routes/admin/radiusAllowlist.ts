// ─────────────────────────────────────────────────────────────────────
//  Admin RADIUS IP allowlist routes.
//
//  When RADIUS_IP_GUARD_ENABLED=true, the /radius/* preHandler checks
//  incoming source IPs against this table.  Empty table = allow all.
//
//  GET    /admin/radius-allowlist
//  POST   /admin/radius-allowlist        { cidr, label?, enabled? }
//  PATCH  /admin/radius-allowlist/:id   { label?, enabled? }
//  DELETE /admin/radius-allowlist/:id
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";
import { invalidateIpGuardCache } from "../../lib/ipGuard.js";

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

const CreateBody = z.object({
  cidr: z
    .string()
    .min(1)
    .max(50)
    .regex(CIDR_RE, "Must be an IPv4 address or CIDR, e.g. 192.168.1.0/24"),
  label: z.string().max(80).optional(),
  enabled: z.boolean().default(true),
});

const PatchBody = z.object({
  label: z.string().max(80).optional(),
  enabled: z.boolean().optional(),
});

const adminRadiusAllowlist: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // ── GET /admin/radius-allowlist ──────────────────────────────────
  app.get("/radius-allowlist", async () => {
    return prisma.radiusAllowedIp.findMany({ orderBy: { createdAt: "asc" } });
  });

  // ── POST /admin/radius-allowlist ─────────────────────────────────
  app.post<{ Body: z.infer<typeof CreateBody> }>("/radius-allowlist", async (req, reply) => {
    const body = CreateBody.parse(req.body);

    const entry = await prisma.radiusAllowedIp.create({
      data: { cidr: body.cidr, label: body.label ?? null, enabled: body.enabled },
    });

    invalidateIpGuardCache();

    await audit({
      actorId: req.currentUser!.sub,
      action: "radius_ip_create",
      targetType: "radius_allowed_ip",
      targetId: entry.id,
      metadata: { cidr: entry.cidr, label: entry.label, enabled: entry.enabled },
      req,
    });

    return reply.status(201).send(entry);
  });

  // ── PATCH /admin/radius-allowlist/:id ───────────────────────────
  app.patch<{ Params: { id: string }; Body: z.infer<typeof PatchBody> }>(
    "/radius-allowlist/:id",
    async (req, reply) => {
      const { id } = req.params;
      const existing = await prisma.radiusAllowedIp.findUnique({ where: { id } });
      if (!existing) throw NotFound("Allowlist entry not found");

      const body = PatchBody.parse(req.body);
      const entry = await prisma.radiusAllowedIp.update({
        where: { id },
        data: {
          ...(body.label !== undefined && { label: body.label }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
        },
      });

      invalidateIpGuardCache();

      await audit({
        actorId: req.currentUser!.sub,
        action: "radius_ip_update",
        targetType: "radius_allowed_ip",
        targetId: id,
        metadata: { cidr: entry.cidr, changes: body },
        req,
      });

      return reply.status(200).send(entry);
    },
  );

  // ── DELETE /admin/radius-allowlist/:id ──────────────────────────
  app.delete<{ Params: { id: string } }>("/radius-allowlist/:id", async (req, reply) => {
    const { id } = req.params;
    const existing = await prisma.radiusAllowedIp.findUnique({ where: { id } });
    if (!existing) throw NotFound("Allowlist entry not found");

    await prisma.radiusAllowedIp.delete({ where: { id } });

    invalidateIpGuardCache();

    await audit({
      actorId: req.currentUser!.sub,
      action: "radius_ip_delete",
      targetType: "radius_allowed_ip",
      targetId: id,
      metadata: { cidr: existing.cidr, label: existing.label },
      req,
    });

    return reply.status(204).send();
  });
};

export default adminRadiusAllowlist;
