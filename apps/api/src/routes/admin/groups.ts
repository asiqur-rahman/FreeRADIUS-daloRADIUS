// ─────────────────────────────────────────────────────────────────────
//  Admin groups + group attributes.
//  Mutations propagate to radgroupcheck / radgroupreply via
//  RadiusPolicyService.syncGroupToRadius.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";
import { syncGroupToRadius } from "../../services/radiusPolicy.js";

const GroupBody = z.object({
  name: z.string().min(2).max(64).regex(/^[a-zA-Z0-9 _.-]+$/),
  description: z.string().max(255).optional(),
  isDefault: z.boolean().optional(),
});

const AttributeBody = z.object({
  attribute: z.string().min(1).max(64),
  op: z.enum([":=", "==", "=", "+=", "!=", ">", "<", ">=", "<=", "=~", "!~", "=*", "!*"]),
  value: z.string().min(1).max(253),
  kind: z.enum(["check", "reply"]),
});

const adminGroups: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  app.get("/groups", async () => {
    return prisma.group.findMany({
      include: { attributes: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.post("/groups", async (req) => {
    const body = GroupBody.parse(req.body);
    const actorId = req.currentUser!.sub;

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({ data: body });
      await syncGroupToRadius(tx, group.id);
      await audit({ tx, actorId, action: "group_create", targetType: "group", targetId: group.id, req });
      return group;
    });
    return created;
  });

  app.patch<{ Params: { id: string } }>("/groups/:id", async (req) => {
    const body = GroupBody.partial().parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.group.findUnique({ where: { id } });
      if (!existing) throw NotFound("Group not found");
      const group = await tx.group.update({ where: { id }, data: body });
      await syncGroupToRadius(tx, id);
      await audit({ tx, actorId, action: "group_update", targetType: "group", targetId: id, req });
      return group;
    });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/groups/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id } });
      if (!group) throw NotFound("Group not found");
      await tx.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${group.name};`;
      await tx.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${group.name};`;
      await tx.$executeRaw`DELETE FROM radusergroup WHERE groupname = ${group.name};`;
      await tx.group.delete({ where: { id } });
      await audit({ tx, actorId, action: "group_delete", targetType: "group", targetId: id, req });
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/groups/:id/attributes", async (req) => {
    const body = AttributeBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    const created = await prisma.$transaction(async (tx) => {
      const attr = await tx.groupAttribute.create({ data: { ...body, groupId: id } });
      await syncGroupToRadius(tx, id);
      await audit({
        tx,
        actorId,
        action: "group_update",
        targetType: "group",
        targetId: id,
        metadata: { addedAttribute: body },
        req,
      });
      return attr;
    });
    return created;
  });

  app.delete<{ Params: { id: string; attrId: string } }>(
    "/groups/:id/attributes/:attrId",
    async (req) => {
      const actorId = req.currentUser!.sub;
      const { id, attrId } = req.params;
      await prisma.$transaction(async (tx) => {
        await tx.groupAttribute.delete({ where: { id: attrId } });
        await syncGroupToRadius(tx, id);
        await audit({
          tx,
          actorId,
          action: "group_update",
          targetType: "group",
          targetId: id,
          metadata: { removedAttributeId: attrId },
          req,
        });
      });
      return { ok: true };
    },
  );
};

export default adminGroups;
