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
import { purgeGroupFromRadius, syncGroupToRadius } from "../../services/radiusPolicy.js";
import { disconnectForPolicyChange } from "../../services/sessions.js";
import { config } from "../../config.js";

async function disconnectMembersIfEnabled(groupId: string, actorId: string, req: Parameters<typeof audit>[0]["req"]) {
  if (!config().COA_DISCONNECT_ON_GROUP_POLICY_CHANGE) return;
  const members = await prisma.userGroup.findMany({ where: { groupId }, select: { userId: true } });
  await Promise.all(
    members.map((member) =>
      disconnectForPolicyChange({
        userId: member.userId,
        actorId,
        reason: "group_policy_change",
        req,
      }),
    ),
  );
}

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
    await disconnectMembersIfEnabled(id, actorId, req);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/groups/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    const members = config().COA_DISCONNECT_ON_GROUP_POLICY_CHANGE
      ? await prisma.userGroup.findMany({ where: { groupId: id }, select: { userId: true } })
      : [];
    await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id } });
      if (!group) throw NotFound("Group not found");
      // All RADIUS-side writes must go through RadiusPolicyService —
      // see CLAUDE.md and the service module docstring for the rule.
      await purgeGroupFromRadius(tx, group.name);
      await tx.group.delete({ where: { id } });
      await audit({ tx, actorId, action: "group_delete", targetType: "group", targetId: id, req });
    });
    await Promise.all(
      members.map((member) =>
        disconnectForPolicyChange({
          userId: member.userId,
          actorId,
          reason: "group_deleted",
          req,
        }),
      ),
    );
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
    await disconnectMembersIfEnabled(id, actorId, req);
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
      await disconnectMembersIfEnabled(id, actorId, req);
      return { ok: true };
    },
  );

  // ── PUT /groups/:id/policy — atomic VLAN + bandwidth convenience endpoint ───
  //  Replaces the 5 managed attributes (Tunnel-*, WISPr-Bandwidth-*) in a single
  //  transaction so CoA is triggered exactly once.

  const PolicyBody = z.object({
    vlanId:           z.number().int().min(1).max(4094).nullable(),
    downloadMbps:     z.number().positive().max(100_000).nullable(),
    uploadMbps:       z.number().positive().max(100_000).nullable(),
    sessionTimeoutSec: z.number().int().min(60).max(604_800).nullable(), // 1 min – 7 days
    idleTimeoutSec:   z.number().int().min(60).max(86_400).nullable(),   // 1 min – 24 h
  });

  const MANAGED_ATTRS = [
    "Tunnel-Type", "Tunnel-Medium-Type", "Tunnel-Private-Group-ID",
    "WISPr-Bandwidth-Max-Down", "WISPr-Bandwidth-Max-Up",
    "Session-Timeout", "Idle-Timeout",
  ];

  app.put<{ Params: { id: string } }>("/groups/:id/policy", async (req) => {
    const body    = PolicyBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id }  = req.params;

    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) throw NotFound("Group not found");

    await prisma.$transaction(async (tx) => {
      // 1. Remove all previously managed attributes
      await tx.groupAttribute.deleteMany({
        where: { groupId: id, attribute: { in: MANAGED_ATTRS } },
      });

      // 2. Re-insert from request (skip null fields)
      const toInsert: Array<{ groupId: string; attribute: string; op: string; value: string; kind: string }> = [];

      if (body.vlanId !== null) {
        // Only insert the ID — Tunnel-Type and Tunnel-Medium-Type are auto-completed
        // in replyFromGroups() inside radius.ts (lines 98–102).
        toInsert.push({ groupId: id, attribute: "Tunnel-Private-Group-ID", op: ":=", value: String(body.vlanId), kind: "reply" });
      }
      if (body.downloadMbps !== null) {
        toInsert.push({ groupId: id, attribute: "WISPr-Bandwidth-Max-Down", op: ":=", value: String(Math.round(body.downloadMbps * 1024 * 1024)), kind: "reply" });
      }
      if (body.uploadMbps !== null) {
        toInsert.push({ groupId: id, attribute: "WISPr-Bandwidth-Max-Up", op: ":=", value: String(Math.round(body.uploadMbps * 1024 * 1024)), kind: "reply" });
      }
      if (body.sessionTimeoutSec !== null) {
        toInsert.push({ groupId: id, attribute: "Session-Timeout", op: ":=", value: String(body.sessionTimeoutSec), kind: "reply" });
      }
      if (body.idleTimeoutSec !== null) {
        toInsert.push({ groupId: id, attribute: "Idle-Timeout", op: ":=", value: String(body.idleTimeoutSec), kind: "reply" });
      }

      if (toInsert.length > 0) {
        await tx.groupAttribute.createMany({ data: toInsert });
      }

      // 3. Sync to radgroupreply
      await syncGroupToRadius(tx, id);

      await audit({
        tx,
        actorId,
        action: "group_update",
        targetType: "group",
        targetId: id,
        metadata: { policy: body },
        req,
      });
    });

    await disconnectMembersIfEnabled(id, actorId, req);

    // Return the full updated group (same shape as GET /groups)
    return prisma.group.findUnique({
      where: { id },
      include: { attributes: true, _count: { select: { members: true } } },
    });
  });
};

export default adminGroups;
