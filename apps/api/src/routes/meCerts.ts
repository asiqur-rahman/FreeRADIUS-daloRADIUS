// ─────────────────────────────────────────────────────────────────────
//  Self-service: user manages their own EAP-TLS client certificates.
//
//  GET  /me/certs              — list own certs (id, fingerprint, status, expiry, password)
//  POST /me/certs/provision    — generate a new cert; returns one-time bundle
//  DELETE /me/certs/:certId    — revoke own cert
//
//  Self-service provisioning can be disabled by an admin via
//  Admin → Settings → Certificates → "Allow users to generate their own certs".
//  When disabled, POST /me/certs/provision returns 403.
//  Users can still see certs provisioned by admins (GET) and revoke their own (DELETE).
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { Forbidden, NotFound } from "../lib/errors.js";
import { issueUserCert } from "../lib/userCertIssuance.js";
import { getCertSettings } from "../lib/certSettings.js";
import { encrypt, decrypt } from "../lib/encrypt.js";

const ProvisionBody = z.object({
  pkcs12Password: z.string().max(128).nullable().optional(),
  notes:          z.string().max(500).nullable().optional(),
});

function decryptPassword(stored: string | null): string | null {
  if (!stored) return null;
  try { return decrypt(stored); } catch { return null; }
}

const meCerts: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // GET /me/certs
  app.get("/me/certs", async (req) => {
    const userId = req.currentUser!.sub;
    const [rows, certSettings] = await Promise.all([
      prisma.userClientCert.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      getCertSettings(),
    ]);

    return {
      userSelfService: certSettings.userSelfService,
      certs: rows.map((c) => ({
        id:             c.id,
        fingerprint:    c.fingerprint,
        commonName:     c.commonName,
        certPem:        c.certPem ?? null,
        pkcs12Password: c.revokedAt ? null : decryptPassword(c.pkcs12Password),
        expiresAt:      c.expiresAt.toISOString(),
        revokedAt:      c.revokedAt?.toISOString() ?? null,
        notes:          c.notes,
        createdAt:      c.createdAt.toISOString(),
      })),
    };
  });

  // POST /me/certs/provision
  app.post("/me/certs/provision", async (req, reply) => {
    const certSettings = await getCertSettings();
    if (!certSettings.userSelfService) {
      throw Forbidden("Self-service certificate generation is disabled. Contact your administrator.");
    }

    const body   = ProvisionBody.parse(req.body);
    const userId = req.currentUser!.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });
    if (!user) throw NotFound("User not found");

    const bundle = await issueUserCert({
      username: user.username,
      email:    user.email,
      pkcs12Password: body.pkcs12Password,
    });

    await prisma.userClientCert.create({
      data: {
        userId:         userId,
        fingerprint:    bundle.fingerprint,
        commonName:     bundle.commonName,
        certPem:        bundle.certificatePem,
        pkcs12Password: encrypt(bundle.pkcs12Password),
        expiresAt:      bundle.expiresAt,
        notes:          body.notes ?? null,
      },
    });

    await audit({
      actorId:    userId,
      action:     "cert_add",
      targetType: "user",
      targetId:   userId,
      metadata:   { fingerprint: bundle.fingerprint, commonName: bundle.commonName, source: "self-service" },
      req,
    });

    return reply.status(201).send({
      fingerprint:    bundle.fingerprint,
      commonName:     bundle.commonName,
      expiresAt:      bundle.expiresAt.toISOString(),
      certificatePem: bundle.certificatePem,
      privateKeyPem:  bundle.privateKeyPem,
      pkcs12Base64:   bundle.pkcs12Base64,
      pkcs12Password: bundle.pkcs12Password,
    });
  });

  // DELETE /me/certs/:certId — revoke
  app.delete<{ Params: { certId: string } }>("/me/certs/:certId", async (req) => {
    const userId = req.currentUser!.sub;
    const cert = await prisma.userClientCert.findFirst({
      where: { id: req.params.certId, userId },
    });
    if (!cert) throw NotFound("Certificate not found");

    await prisma.userClientCert.update({
      where: { id: cert.id },
      data:  { revokedAt: new Date() },
    });

    await audit({
      actorId:    userId,
      action:     "cert_delete",
      targetType: "user",
      targetId:   userId,
      metadata:   { fingerprint: cert.fingerprint, source: "self-service" },
      req,
    });

    return { ok: true };
  });
};

export default meCerts;
