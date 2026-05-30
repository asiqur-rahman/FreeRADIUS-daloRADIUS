// ──────────────────────────────────────────────────────────────────────
//  SAML 2.0 Service Provider routes.
//
//  GET  /saml/metadata         — SP metadata (send to IdP)
//  GET  /saml/login            — redirect to IdP SSO URL
//  POST /saml/callback         — ACS endpoint (IdP POST binding)
//
//  On successful assertion the user is created-or-found in the DB and
//  a short-lived auth token is issued exactly like the normal login flow.
//
//  Settings are stored in platform_settings (prefix "saml.").
//  When saml.enabled != "true" all routes return 501.
// ──────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { buildSamlInstance, extractProfile, loadSamlSettings } from "../lib/saml.js";
import { hashPassword, ntHash } from "../lib/password.js";
import type { AuthTokenPayload } from "../plugins/auth.js";
import { randomBytes } from "node:crypto";

const SettingsBody = z.object({
  enabled:       z.boolean().optional(),
  entryPoint:    z.string().url().optional().or(z.literal("")),
  issuer:        z.string().max(255).optional(),
  cert:          z.string().max(4096).optional(),
  spCert:        z.string().max(4096).optional(),
  spKey:         z.string().max(4096).optional(),
  nameIdFormat:  z.string().max(128).optional(),
  attrUsername:  z.string().max(255).optional(),
  attrEmail:     z.string().max(255).optional(),
  attrFullname:  z.string().max(255).optional(),
});

const KEY_MAP: Record<string, string> = {
  enabled:      "saml.enabled",
  entryPoint:   "saml.entry_point",
  issuer:       "saml.issuer",
  cert:         "saml.cert",
  spCert:       "saml.sp_cert",
  spKey:        "saml.sp_key",
  nameIdFormat: "saml.name_id_format",
  attrUsername: "saml.attr_username",
  attrEmail:    "saml.attr_email",
  attrFullname: "saml.attr_fullname",
};

function callbackUrl(req: { hostname: string; protocol: string }): string {
  return `${req.protocol}://${req.hostname}/api/v1/saml/callback`;
}

const samlRoutes: FastifyPluginAsync = async (app) => {
  // ── Admin settings routes (protected) ────────────────────────────────

  app.get("/saml/settings", {
    preHandler: [app.authenticate, app.authorize(["admin"])],
  }, async () => {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { startsWith: "saml." } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      enabled:      map["saml.enabled"]       === "true",
      entryPoint:   map["saml.entry_point"]    ?? "",
      issuer:       map["saml.issuer"]         ?? "",
      cert:         map["saml.cert"] ? "••••" : "",
      spCert:       map["saml.sp_cert"] ? "••••" : "",
      spKey:        map["saml.sp_key"]  ? "••••" : "",
      nameIdFormat: map["saml.name_id_format"] ?? "",
      attrUsername: map["saml.attr_username"]  ?? "",
      attrEmail:    map["saml.attr_email"]     ?? "",
      attrFullname: map["saml.attr_fullname"]  ?? "",
    };
  });

  app.put("/saml/settings", {
    preHandler: [app.authenticate, app.authorize(["admin"])],
  }, async (req, reply) => {
    const body = SettingsBody.parse(req.body);

    for (const [field, key] of Object.entries(KEY_MAP)) {
      const val = body[field as keyof typeof body];
      if (val === undefined) continue;
      // Don't overwrite masked sensitive fields
      if (["cert", "spCert", "spKey"].includes(field) && val === "••••") continue;
      const strVal = typeof val === "boolean" ? String(val) : String(val);
      await prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: strVal },
        update: { value: strVal },
      });
    }

    return reply.status(200).send({ ok: true });
  });

  // ── Public SSO routes ─────────────────────────────────────────────────

  // GET /saml/metadata
  app.get("/saml/metadata", async (req, reply) => {
    const settings = await loadSamlSettings();
    if (!settings) return reply.status(501).send({ error: "SAML is not configured" });

    const saml = buildSamlInstance(settings, callbackUrl(req));
    const xml = saml.generateServiceProviderMetadata(settings.spCert || null, settings.spCert || null);
    return reply.type("application/xml").send(xml);
  });

  // GET /saml/login — redirect to IdP
  app.get("/saml/login", async (req, reply) => {
    const settings = await loadSamlSettings();
    if (!settings) return reply.status(501).send({ error: "SAML is not configured" });

    const saml = buildSamlInstance(settings, callbackUrl(req));
    const url = await saml.getAuthorizeUrlAsync("", "", {});
    return reply.redirect(url);
  });

  // POST /saml/callback — ACS
  app.post<{ Body: { SAMLResponse?: string; RelayState?: string } }>(
    "/saml/callback",
    async (req, reply) => {
      const settings = await loadSamlSettings();
      if (!settings) return reply.status(501).send({ error: "SAML is not configured" });

      if (!req.body.SAMLResponse) {
        return reply.status(400).send({ error: "Missing SAMLResponse" });
      }

      const saml = buildSamlInstance(settings, callbackUrl(req));
      let profile;
      try {
        const result = await saml.validatePostResponseAsync(req.body as Record<string, string>);
        profile = result.profile;
      } catch (err) {
        req.log.warn({ err }, "saml.callback validation failed");
        return reply.status(401).send({ error: "SAML assertion validation failed" });
      }

      if (!profile) return reply.status(401).send({ error: "Empty SAML profile" });

      const { username, email, fullName } = extractProfile(profile, settings);
      if (!username || !email) {
        return reply.status(400).send({ error: "SAML profile missing required fields" });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: { OR: [{ username }, { email }] },
        include: { secret: true },
      });

      if (!user) {
        const tempPwd = randomBytes(16).toString("base64url");
        const [argon2id, nt] = await Promise.all([hashPassword(tempPwd), Promise.resolve(ntHash(tempPwd))]);
        user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: { username, email, fullName, status: "active" },
            include: { secret: true },
          });
          await tx.userSecret.create({
            data: {
              userId: u.id,
              passwordHashArgon2id: argon2id,
              ntHash: nt,
              mustChangePassword: false,
            },
          });
          return tx.user.findUniqueOrThrow({
            where: { id: u.id },
            include: { secret: true },
          });
        });
      }

      if (user.status !== "active") {
        return reply.status(403).send({ error: "Account is not active" });
      }

      const c = config();
      const secret = await prisma.userSecret.findUnique({ where: { userId: user.id } });

      const accessPayload: AuthTokenPayload = { sub: user.id, username: user.username, role: user.role, typ: "access" };
      const refreshPayload: AuthTokenPayload = { ...accessPayload, typ: "refresh", tokenVersion: secret?.tokenVersion ?? 0 };

      const accessToken  = await reply.jwtSign(accessPayload,  { expiresIn: c.ACCESS_TOKEN_TTL });
      const refreshToken = await reply.jwtSign(refreshPayload, { expiresIn: c.REFRESH_TOKEN_TTL });

      reply.setCookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: c.COOKIE_SECURE,
        sameSite: "strict",
        domain: c.COOKIE_DOMAIN,
        signed: true,
        path: "/api/v1/auth",
      });

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      // Redirect to frontend root — the refresh cookie is now set, so the
      // SPA's startup auth/refresh call will restore the session automatically.
      const frontendOrigin = (Array.isArray(c.CORS_ORIGINS) ? c.CORS_ORIGINS[0] : undefined) ?? "http://localhost:5173";
      // Suppress unused-variable warning — accessToken is intentionally not exposed in URL
      void accessToken;
      return reply.redirect(frontendOrigin);
    },
  );
};

export default samlRoutes;
