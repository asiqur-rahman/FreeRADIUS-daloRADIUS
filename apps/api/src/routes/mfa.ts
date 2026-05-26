import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { BadRequest, Unauthorized } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";
import { createTotpEnrollment, verifyTotp } from "../lib/totp.js";

const SetupBody = z.object({ currentPassword: z.string().min(1) });
const EnableBody = z.object({ code: z.string().regex(/^\d{6}$/) });
const DisableBody = z.object({
  currentPassword: z.string().min(1),
  code: z.string().regex(/^\d{6}$/).optional(),
});

async function userWithSecret(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { secret: true } });
  if (!user?.secret) throw Unauthorized();
  return user;
}

async function requirePassword(userId: string, password: string) {
  const user = await userWithSecret(userId);
  if (!(await verifyPassword(user.secret!.passwordHashArgon2id, password))) {
    throw Unauthorized("Current password is incorrect");
  }
  return user;
}

const mfaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/me/mfa", async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.currentUser!.sub }, select: { mfaEnabled: true, mfaSecret: true } });
    if (!user) throw Unauthorized();
    return { enabled: user.mfaEnabled, pendingEnrollment: Boolean(user.mfaSecret && !user.mfaEnabled) };
  });

  app.post("/me/mfa/setup", async (req) => {
    const body = SetupBody.parse(req.body);
    const user = await requirePassword(req.currentUser!.sub, body.currentPassword);
    const enrollment = createTotpEnrollment(user.username);
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: enrollment.encryptedSecret },
    });
    return { secret: enrollment.secret, otpauthUri: enrollment.otpauthUri };
  });

  app.post("/me/mfa/enable", async (req) => {
    const { code } = EnableBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.currentUser!.sub } });
    if (!user?.mfaSecret) throw BadRequest("Start MFA setup before enabling it");
    if (!verifyTotp(user.mfaSecret, code)) throw Unauthorized("Verification code is incorrect");
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await audit({ actorId: user.id, action: "mfa_enable", targetType: "user", targetId: user.id, req });
    return { enabled: true, pendingEnrollment: false };
  });

  app.delete("/me/mfa", async (req) => {
    const body = DisableBody.parse(req.body);
    const user = await requirePassword(req.currentUser!.sub, body.currentPassword);
    if (user.mfaEnabled && (!body.code || !user.mfaSecret || !verifyTotp(user.mfaSecret, body.code))) {
      throw Unauthorized("Verification code is required to disable MFA");
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await audit({ actorId: user.id, action: "mfa_disable", targetType: "user", targetId: user.id, req });
    return { enabled: false, pendingEnrollment: false };
  });
};

export default mfaRoutes;
