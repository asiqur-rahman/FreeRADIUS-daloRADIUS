// ─────────────────────────────────────────────────────────────────────
//  Admin user CRUD — Phase 1 scope.
//
//  Every write goes through RadiusPolicyService inside a transaction
//  so the app rows and the RADIUS rows can never disagree.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { hashPassword, ntHash } from "../../lib/password.js";
import { audit } from "../../lib/audit.js";
import { BadRequest, NotFound } from "../../lib/errors.js";
import { changeUserPassword, syncUserToRadius } from "../../services/radiusPolicy.js";
import type { Paginated, UserSummary } from "@app/shared";

// ── Schemas ────────────────────────────────────────────────────────

const usernameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9._-]+$/i, "username may only contain letters, digits, dot, underscore, hyphen");

const passwordSchema = z.string().min(10).max(256);

const CreateUserBody = z.object({
  username: usernameSchema,
  email: z.string().email().max(254),
  fullName: z.string().max(120).optional(),
  password: passwordSchema,
  role: z.enum(["admin", "user"]).optional(),
  groupIds: z.array(z.string()).optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

const UpdateUserBody = z.object({
  email: z.string().email().max(254).optional(),
  fullName: z.string().max(120).nullable().optional(),
  role: z.enum(["admin", "user"]).optional(),
  status: z.enum(["pending", "active", "suspended", "expired"]).optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  groupIds: z.array(z.string()).optional(),
});

const ResetPasswordBody = z.object({
  newPassword: passwordSchema,
  mustChange: z.boolean().optional(),
});

const ListQuery = z.object({
  q: z.string().max(64).optional(),
  status: z.enum(["pending", "active", "suspended", "expired"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ── Mapping ────────────────────────────────────────────────────────

const include = {
  groups: { include: { group: true } },
} satisfies Prisma.UserInclude;

type UserWithGroups = Prisma.UserGetPayload<{ include: typeof include }>;

function toSummary(u: UserWithGroups): UserSummary {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
    validFrom: u.validFrom?.toISOString() ?? null,
    validUntil: u.validUntil?.toISOString() ?? null,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    groups: u.groups.map((g) => ({ id: g.group.id, name: g.group.name })),
  };
}

// ── Routes ─────────────────────────────────────────────────────────

const adminUsers: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/users
  app.get("/users", async (req) => {
    const q = ListQuery.parse(req.query);

    const where: Prisma.UserWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.role) where.role = q.role;
    if (q.q) {
      where.OR = [
        { username: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { fullName: { contains: q.q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    const body: Paginated<UserSummary> = {
      items: items.map(toSummary),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    return body;
  });

  // GET /admin/users/:id
  app.get<{ Params: { id: string } }>("/users/:id", async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include });
    if (!user) throw NotFound("User not found");
    return toSummary(user);
  });

  // POST /admin/users
  app.post("/users", async (req) => {
    const body = CreateUserBody.parse(req.body);
    const actorId = req.currentUser!.sub;

    const passwordHashArgon2id = await hashPassword(body.password);
    const nthash = ntHash(body.password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: body.username.toLowerCase(),
          email: body.email.toLowerCase(),
          fullName: body.fullName,
          role: body.role ?? "user",
          status: "active",
          validFrom: body.validFrom ? new Date(body.validFrom) : null,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          secret: {
            create: { passwordHashArgon2id, ntHash: nthash, mustChangePassword: true },
          },
          groups: body.groupIds
            ? { create: body.groupIds.map((gid, i) => ({ groupId: gid, priority: i + 1 })) }
            : undefined,
        },
        include,
      });

      await syncUserToRadius(tx, user.id);
      await audit({
        tx,
        actorId,
        action: "user_create",
        targetType: "user",
        targetId: user.id,
        metadata: { username: user.username, role: user.role },
        req,
      });
      return user;
    });

    return toSummary(created);
  });

  // PATCH /admin/users/:id
  app.patch<{ Params: { id: string } }>("/users/:id", async (req) => {
    const body = UpdateUserBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw NotFound("User not found");

      const data: Prisma.UserUpdateInput = {
        email: body.email?.toLowerCase(),
        fullName: body.fullName,
        role: body.role,
        status: body.status,
        validFrom: body.validFrom === undefined ? undefined : body.validFrom ? new Date(body.validFrom) : null,
        validUntil:
          body.validUntil === undefined ? undefined : body.validUntil ? new Date(body.validUntil) : null,
      };
      await tx.user.update({ where: { id }, data });

      if (body.groupIds) {
        await tx.userGroup.deleteMany({ where: { userId: id } });
        if (body.groupIds.length) {
          await tx.userGroup.createMany({
            data: body.groupIds.map((gid, i) => ({ userId: id, groupId: gid, priority: i + 1 })),
          });
        }
      }

      await syncUserToRadius(tx, id);

      const after = await tx.user.findUnique({ where: { id }, include });
      await audit({
        tx,
        actorId,
        action: "user_update",
        targetType: "user",
        targetId: id,
        metadata: { changes: body },
        req,
      });
      return after!;
    });

    return toSummary(updated);
  });

  // POST /admin/users/:id/reset-password
  app.post<{ Params: { id: string } }>("/users/:id/reset-password", async (req) => {
    const { newPassword, mustChange = true } = ResetPasswordBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    if (newPassword.length < 10) throw BadRequest("Password too short");

    await changeUserPassword({
      userId: id,
      newPassword,
      actorId,
      mustChange,
      req,
    });

    await audit({
      actorId,
      action: "user_reset_password",
      targetType: "user",
      targetId: id,
      metadata: { forced: true },
      req,
    });

    return { ok: true };
  });

  // DELETE /admin/users/:id  — soft-delete by suspending.
  // Hard delete deferred per architecture doc (audit retention).
  app.delete<{ Params: { id: string } }>("/users/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;

    if (id === actorId) throw BadRequest("Cannot delete your own account");

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw NotFound("User not found");

      await tx.user.update({ where: { id }, data: { status: "suspended" } });
      await syncUserToRadius(tx, id);
      await audit({
        tx,
        actorId,
        action: "user_delete",
        targetType: "user",
        targetId: id,
        metadata: { soft: true, username: existing.username },
        req,
      });
    });

    return { ok: true };
  });
};

export default adminUsers;
