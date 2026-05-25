// ─────────────────────────────────────────────────────────────────────
//  Self-service routes (/api/v1/me/...).
//  Phase 1 ships password change only; devices/sessions arrive in
//  Phase 3 alongside the device-management UI.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword } from "../lib/password.js";
import { BadRequest, Unauthorized } from "../lib/errors.js";
import { changeUserPassword } from "../services/radiusPolicy.js";
import { audit } from "../lib/audit.js";

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(256),
});

const me: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post("/me/password", async (req) => {
    const { currentPassword, newPassword } = ChangePasswordBody.parse(req.body);
    if (currentPassword === newPassword) {
      throw BadRequest("New password must differ from current");
    }

    const userId = req.currentUser!.sub;
    const secret = await prisma.userSecret.findUnique({ where: { userId } });
    if (!secret) throw Unauthorized();

    const ok = await verifyPassword(secret.passwordHashArgon2id, currentPassword);
    if (!ok) throw Unauthorized("Current password is incorrect");

    await changeUserPassword({
      userId,
      newPassword,
      actorId: userId,
      req,
    });

    await audit({
      actorId: userId,
      action: "password_change",
      targetType: "user",
      targetId: userId,
      req,
    });

    return { ok: true };
  });
};

export default me;
