// ─────────────────────────────────────────────────────────────────────
//  Admin: user-level EAP-TLS client certificate provisioning.
//
//  POST /admin/users/:id/provision-cert
//    Generates a client certificate for a user signed by the platform CA.
//    The cert is NOT tied to a specific device MAC — any device presenting
//    this cert will be auto-registered and granted access.
//
//  GET  /admin/users/:id/certs
//    List all provisioned certs for a user.
//
//  DELETE /admin/users/:id/certs/:certId
//    Revoke a cert (marks revokedAt, blocks future EAP-TLS logins).
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { NotFound } from "../../lib/errors.js";
import { issueUserCert } from "../../lib/userCertIssuance.js";

// ── Routes ─────────────────────────────────────────────────────────

const ProvisionBody = z.object({
  notes:          z.string().max(500).nullable().optional(),
  pkcs12Password: z.string().max(128).nullable().optional(),
});

const adminUserCerts: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/users/:id/certs
  app.get<{ Params: { id: string } }>("/users/:id/certs", async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw NotFound("User not found");

    const certs = await prisma.userClientCert.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: "desc" },
    });

    return certs.map((c) => ({
      id:          c.id,
      fingerprint: c.fingerprint,
      commonName:  c.commonName,
      expiresAt:   c.expiresAt.toISOString(),
      revokedAt:   c.revokedAt?.toISOString() ?? null,
      notes:       c.notes,
      createdAt:   c.createdAt.toISOString(),
    }));
  });

  // POST /admin/users/:id/provision-cert
  app.post<{ Params: { id: string } }>("/users/:id/provision-cert", async (req, reply) => {
    const body    = ProvisionBody.parse(req.body);
    const actorId = req.currentUser!.sub;
    const { id }  = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw NotFound("User not found");

    const bundle = await issueUserCert({
      username: user.username,
      email:    user.email,
      pkcs12Password: body.pkcs12Password,
    });

    // Store fingerprint — future EAP-TLS auth will match on this
    await prisma.userClientCert.create({
      data: {
        userId:      id,
        fingerprint: bundle.fingerprint,
        commonName:  bundle.commonName,
        expiresAt:   bundle.expiresAt,
        notes:       body.notes ?? null,
      },
    });

    await audit({
      actorId,
      action:     "cert_add",
      targetType: "user",
      targetId:   id,
      metadata:   { fingerprint: bundle.fingerprint, commonName: bundle.commonName },
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

  // DELETE /admin/users/:id/certs/:certId  — revoke
  app.delete<{ Params: { id: string; certId: string } }>("/users/:id/certs/:certId", async (req) => {
    const actorId = req.currentUser!.sub;
    const cert = await prisma.userClientCert.findFirst({
      where: { id: req.params.certId, userId: req.params.id },
    });
    if (!cert) throw NotFound("Certificate not found");

    await prisma.userClientCert.update({
      where: { id: cert.id },
      data:  { revokedAt: new Date() },
    });

    await audit({
      actorId,
      action:     "cert_delete",
      targetType: "user",
      targetId:   req.params.id,
      metadata:   { fingerprint: cert.fingerprint },
      req,
    });

    return { ok: true };
  });
};

export default adminUserCerts;
