// ─────────────────────────────────────────────────────────────────────
//  EAP server certificate inventory.
//
//  Architecture doc §5.4 + §6.2 flag the EAP server cert as a silent
//  killer — when it expires, every 802.1X user is rejected. Inventory
//  + the 60/30/7 day alert windows are the platform's mitigation.
//
//  Phase 2 ships:
//   - list with computed daysUntilExpiry + severity bucket
//   - add (parse a PEM, extract subject/issuer/serial/not-after)
//   - activate (mark one cert isActive, demote the previous)
//   - delete
//
//  Distributing the cert to FreeRADIUS is out of scope here — that's
//  an operator + Ansible/MDM concern. The platform tracks the metadata.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { X509Certificate, createHash } from "node:crypto";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { BadRequest, NotFound } from "../../lib/errors.js";

const AddCertBody = z.object({
  pem: z.string().min(64, "Expected a PEM-encoded X.509 certificate"),
  activate: z.boolean().default(false),
  notes: z.string().max(255).nullish(),
});

interface CertView {
  id: string;
  subject: string;
  issuer: string | null;
  fingerprint: string;
  fingerprintSha1: string | null;
  serial: string | null;
  issuedAt: string;
  expiresAt: string;
  isActive: boolean;
  notes: string | null;
  daysUntilExpiry: number;
  severity: "ok" | "warn-60" | "warn-30" | "critical-7" | "expired";
}

function severityFor(days: number): CertView["severity"] {
  if (days < 0) return "expired";
  if (days <= 7) return "critical-7";
  if (days <= 30) return "warn-30";
  if (days <= 60) return "warn-60";
  return "ok";
}

function toView(c: {
  id: string;
  subject: string;
  issuer: string | null;
  fingerprint: string;
  fingerprintSha1: string | null;
  serial: string | null;
  issuedAt: Date;
  expiresAt: Date;
  isActive: boolean;
  notes: string | null;
}): CertView {
  const daysUntilExpiry = Math.floor((c.expiresAt.getTime() - Date.now()) / 86_400_000);
  return {
    id: c.id,
    subject: c.subject,
    issuer: c.issuer,
    fingerprint: c.fingerprint,
    fingerprintSha1: c.fingerprintSha1,
    serial: c.serial,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    isActive: c.isActive,
    notes: c.notes,
    daysUntilExpiry,
    severity: severityFor(daysUntilExpiry),
  };
}

const adminCerts: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/certs
  app.get("/certs", async () => {
    const certs = await prisma.eapCertificate.findMany({ orderBy: { expiresAt: "asc" } });
    return certs.map(toView);
  });

  // POST /admin/certs  — supply a PEM, we extract everything else.
  app.post("/certs", async (req) => {
    const body = AddCertBody.parse(req.body);
    const actorId = req.currentUser!.sub;

    let parsed: X509Certificate;
    try {
      parsed = new X509Certificate(body.pem);
    } catch (e) {
      throw BadRequest("Could not parse PEM as an X.509 certificate", {
        cause: e instanceof Error ? e.message : String(e),
      });
    }

    // Compute both fingerprints from the DER bytes.
    // SHA-256 is the primary unique key; SHA-1 is exposed for Windows WPA2-Enterprise
    // "Trusted certificate thumbprints" (which only accepts SHA-1).
    const raw       = createHash("sha256").update(parsed.raw).digest("hex");
    const rawSha1   = createHash("sha1").update(parsed.raw).digest("hex");

    const created = await prisma.$transaction(async (tx) => {
      // De-dup on fingerprint.
      const existing = await tx.eapCertificate.findUnique({ where: { fingerprint: raw } });
      if (existing) {
        if (body.activate && !existing.isActive) {
          await tx.eapCertificate.updateMany({ data: { isActive: false }, where: { isActive: true } });
          await tx.eapCertificate.update({ where: { id: existing.id }, data: { isActive: true } });
          await audit({
            tx,
            actorId,
            action: "cert_activate",
            targetType: "cert",
            targetId: existing.id,
            req,
          });
          return tx.eapCertificate.findUnique({ where: { id: existing.id } });
        }
        return existing;
      }

      const cert = await tx.eapCertificate.create({
        data: {
          subject:         parsed.subject,
          issuer:          parsed.issuer ?? null,
          fingerprint:     raw,
          fingerprintSha1: rawSha1,
          serial:          parsed.serialNumber ?? null,
          issuedAt:        new Date(parsed.validFrom),
          expiresAt:       new Date(parsed.validTo),
          notes:           body.notes ?? null,
        },
      });

      if (body.activate) {
        await tx.eapCertificate.updateMany({ data: { isActive: false }, where: { isActive: true } });
        await tx.eapCertificate.update({ where: { id: cert.id }, data: { isActive: true } });
      }

      await audit({
        tx,
        actorId,
        action: "cert_add",
        targetType: "cert",
        targetId: cert.id,
        metadata: { subject: cert.subject, expiresAt: cert.expiresAt.toISOString() },
        req,
      });
      return tx.eapCertificate.findUnique({ where: { id: cert.id } });
    });

    return toView(created!);
  });

  // POST /admin/certs/:id/activate
  app.post<{ Params: { id: string } }>("/certs/:id/activate", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    const activated = await prisma.$transaction(async (tx) => {
      const cert = await tx.eapCertificate.findUnique({ where: { id } });
      if (!cert) throw NotFound("Certificate not found");
      await tx.eapCertificate.updateMany({ data: { isActive: false }, where: { isActive: true } });
      const updated = await tx.eapCertificate.update({ where: { id }, data: { isActive: true } });
      await audit({
        tx,
        actorId,
        action: "cert_activate",
        targetType: "cert",
        targetId: id,
        req,
      });
      return updated;
    });
    return toView(activated);
  });

  // DELETE /admin/certs/:id
  app.delete<{ Params: { id: string } }>("/certs/:id", async (req) => {
    const actorId = req.currentUser!.sub;
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      const cert = await tx.eapCertificate.findUnique({ where: { id } });
      if (!cert) throw NotFound("Certificate not found");
      if (cert.isActive) throw BadRequest("Cannot delete the active certificate — activate another first");
      await tx.eapCertificate.delete({ where: { id } });
      await audit({
        tx,
        actorId,
        action: "cert_delete",
        targetType: "cert",
        targetId: id,
        metadata: { subject: cert.subject, fingerprint: cert.fingerprint },
        req,
      });
    });
    return { ok: true };
  });
};

export default adminCerts;
