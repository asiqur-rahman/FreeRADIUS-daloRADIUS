// ─────────────────────────────────────────────────────────────────────
//  Admin sites — logical grouping of NAS devices for per-site reporting
//  (Phase 4) and config segmentation. Plain CRUD, no RADIUS-side rows
//  to keep in sync.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";

const SiteBody = z.object({
  name: z.string().min(1).max(64),
  region: z.string().max(64).nullish(),
  address: z.string().max(255).nullish(),
});

const adminSites: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  app.get("/sites", async () => {
    return prisma.site.findMany({
      include: { _count: { select: { nasClients: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.post("/sites", async (req) => {
    const body = SiteBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const site = await prisma.$transaction(async (tx) => {
      const s = await tx.site.create({
        data: {
          name: body.name,
          region: body.region ?? null,
          address: body.address ?? null,
        },
      });
      await audit({ tx, actorId, action: "site_create", targetType: "site", targetId: s.id, req });
      return s;
    });
    return site;
  });

  app.patch<{ Params: { id: string } }>("/sites/:id", async (req) => {
    const body = SiteBody.partial().parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    const site = await prisma.$transaction(async (tx) => {
      const existing = await tx.site.findUnique({ where: { id } });
      if (!existing) throw NotFound("Site not found");
      const s = await tx.site.update({
        where: { id },
        data: {
          name: body.name,
          region: body.region === undefined ? undefined : body.region,
          address: body.address === undefined ? undefined : body.address,
        },
      });
      await audit({ tx, actorId, action: "site_update", targetType: "site", targetId: id, req });
      return s;
    });
    return site;
  });

  app.delete<{ Params: { id: string } }>("/sites/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.site.findUnique({
        where: { id },
        include: { _count: { select: { nasClients: true } } },
      });
      if (!existing) throw NotFound("Site not found");
      if (existing._count.nasClients > 0) {
        // Unassign rather than cascade — operators rarely want NAS rows
        // gone when they delete a site.
        await tx.nasClient.updateMany({ where: { siteId: id }, data: { siteId: null } });
      }
      await tx.site.delete({ where: { id } });
      await audit({ tx, actorId, action: "site_delete", targetType: "site", targetId: id, req });
    });
    return { ok: true };
  });
};

export default adminSites;
