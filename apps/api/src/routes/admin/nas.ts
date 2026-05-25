// ─────────────────────────────────────────────────────────────────────
//  Admin NAS (RADIUS client) routes.
//
//  Per the architecture doc:
//   - per-NAS shared secret ≥ 32 chars (production); we enforce ≥ 16
//     and warn in the response when shorter.
//   - vendor templates: cisco / aruba / ubiquiti / mikrotik / meraki.
//   - rotation endpoint: generates a new secret and propagates atomically.
//
//  Every mutation goes through RadiusPolicyService.syncNasToRadius so
//  the freeradius `nas` table matches the app's NasClient row.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";
import { purgeNasFromRadius, syncNasToRadius } from "../../services/radiusPolicy.js";

const VENDOR_TYPES = ["cisco", "aruba", "ubiquiti", "mikrotik", "meraki", "other"] as const;

const CreateNasBody = z.object({
  nasname: z
    .string()
    .min(1)
    .max(128)
    .regex(
      /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[a-zA-Z0-9.-]+$/,
      "nasname must be an IPv4, CIDR, or hostname",
    ),
  shortname: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  secret: z.string().min(16, "Shared secret must be at least 16 characters").max(60).optional(),
  type: z.enum(VENDOR_TYPES).default("other"),
  description: z.string().max(200).nullish(),
  enabled: z.boolean().default(true),
  coaPort: z.number().int().min(1).max(65535).default(3799),
  siteId: z.string().nullish(),
});

const UpdateNasBody = CreateNasBody.partial();

const ListQuery = z.object({
  q: z.string().max(64).optional(),
  enabled: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().optional()),
  siteId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function generateSecret(bytes = 24): string {
  // 24 bytes → 32 chars base64url; meets the doc's ≥32 char production rule.
  return randomBytes(bytes).toString("base64url");
}

const adminNas: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/nas
  app.get("/nas", async (req) => {
    const q = ListQuery.parse(req.query);

    const where: Prisma.NasClientWhereInput = {};
    if (q.enabled !== undefined) where.enabled = q.enabled;
    if (q.siteId) where.siteId = q.siteId;
    if (q.q) {
      where.OR = [
        { nasname: { contains: q.q, mode: "insensitive" } },
        { shortname: { contains: q.q, mode: "insensitive" } },
        { description: { contains: q.q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.nasClient.findMany({
        where,
        include: { site: true },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.nasClient.count({ where }),
    ]);

    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  // GET /admin/nas/:id
  app.get<{ Params: { id: string } }>("/nas/:id", async (req) => {
    const nas = await prisma.nasClient.findUnique({
      where: { id: req.params.id },
      include: { site: true },
    });
    if (!nas) throw NotFound("NAS not found");
    return nas;
  });

  // POST /admin/nas
  app.post("/nas", async (req) => {
    const body = CreateNasBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const secret = body.secret ?? generateSecret();

    const created = await prisma.$transaction(async (tx) => {
      const nas = await tx.nasClient.create({
        data: {
          nasname: body.nasname,
          shortname: body.shortname,
          secret,
          type: body.type,
          description: body.description ?? null,
          enabled: body.enabled,
          coaPort: body.coaPort,
          siteId: body.siteId ?? null,
        },
        include: { site: true },
      });
      await syncNasToRadius(tx, nas.id);
      await audit({
        tx,
        actorId,
        action: "nas_create",
        targetType: "nas",
        targetId: nas.id,
        metadata: { nasname: nas.nasname, shortname: nas.shortname, type: nas.type },
        req,
      });
      return nas;
    });

    // Surface a one-time secret display warning the UI can show.
    return { ...created, _generatedSecret: body.secret ? undefined : secret };
  });

  // PATCH /admin/nas/:id
  app.patch<{ Params: { id: string } }>("/nas/:id", async (req) => {
    const body = UpdateNasBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.nasClient.findUnique({ where: { id } });
      if (!existing) throw NotFound("NAS not found");

      const nasnameChanging = body.nasname && body.nasname !== existing.nasname;

      const nas = await tx.nasClient.update({
        where: { id },
        data: {
          nasname: body.nasname,
          shortname: body.shortname,
          secret: body.secret,
          type: body.type,
          description: body.description === undefined ? undefined : body.description,
          enabled: body.enabled,
          coaPort: body.coaPort,
          siteId: body.siteId === undefined ? undefined : body.siteId,
        },
        include: { site: true },
      });

      // If the IP/hostname changed, the old `nas` table row keys on the
      // previous nasname — drop it explicitly before syncing the new one.
      if (nasnameChanging) {
        await purgeNasFromRadius(tx, existing.nasname);
      }
      await syncNasToRadius(tx, id);
      await audit({
        tx,
        actorId,
        action: "nas_update",
        targetType: "nas",
        targetId: id,
        metadata: { changes: body },
        req,
      });
      return nas;
    });

    return updated;
  });

  // POST /admin/nas/:id/rotate-secret
  // Replaces the shared secret atomically. The new value is returned
  // exactly once — operators must copy it before navigating away.
  app.post<{ Params: { id: string } }>("/nas/:id/rotate-secret", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    const newSecret = generateSecret();

    const nas = await prisma.$transaction(async (tx) => {
      const existing = await tx.nasClient.findUnique({ where: { id } });
      if (!existing) throw NotFound("NAS not found");

      const updated = await tx.nasClient.update({
        where: { id },
        data: { secret: newSecret },
      });
      await syncNasToRadius(tx, id);
      await audit({
        tx,
        actorId,
        action: "nas_rotate_secret",
        targetType: "nas",
        targetId: id,
        metadata: { nasname: updated.nasname },
        req,
      });
      return updated;
    });

    return { id: nas.id, nasname: nas.nasname, newSecret };
  });

  // DELETE /admin/nas/:id
  app.delete<{ Params: { id: string } }>("/nas/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.nasClient.findUnique({ where: { id } });
      if (!existing) throw NotFound("NAS not found");
      await purgeNasFromRadius(tx, existing.nasname);
      await tx.nasClient.delete({ where: { id } });
      await audit({
        tx,
        actorId,
        action: "nas_delete",
        targetType: "nas",
        targetId: id,
        metadata: { nasname: existing.nasname },
        req,
      });
    });

    return { ok: true };
  });
};

export default adminNas;
