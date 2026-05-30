// ─────────────────────────────────────────────────────────────────────
//  Self-service core routes (/api/v1/me/...).
//
//  Registered here:
//    POST /me/password  — change own password
//    GET  /me/wifi-ca   — download the WiFi CA cert (for EAP-TLS setup)
//
//  Related plugins (registered alongside in server.ts):
//    meDevices.ts  — /me/devices, /me/sessions
//    meCerts.ts    — /me/certs  (user-level EAP-TLS certificates)
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword } from "../lib/password.js";
import { BadRequest, Unauthorized, NotFound } from "../lib/errors.js";
import { changeUserPassword } from "../services/radiusPolicy.js";
import { audit } from "../lib/audit.js";
import { assertPasswordNotBreached } from "../lib/passwordPolicy.js";
import { loadCa } from "../lib/ca.js";

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

    await assertPasswordNotBreached(newPassword);
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

  app.get("/me/wifi-ca", async (_req, reply) => {
    const ca = await loadCa();
    if (!ca) throw NotFound("WiFi CA certificate is not configured on this server");
    reply
      .header("Content-Type", "application/x-pem-file")
      .header("Content-Disposition", 'attachment; filename="wifi-ca.pem"')
      .send(ca.certPem);
  });
};

export default me;
