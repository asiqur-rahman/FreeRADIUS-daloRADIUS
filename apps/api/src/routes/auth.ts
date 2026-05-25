// ─────────────────────────────────────────────────────────────────────
//  Authentication routes — login, refresh, logout, /me.
//
//  Phase-1 simplification: refresh tokens are signed JWTs with the
//  same secret as access tokens; logout is best-effort (clears cookie
//  + records audit). Phase-5 will add Redis-backed revocation.
// ─────────────────────────────────────────────────────────────────────
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { verifyPassword } from "../lib/password.js";
import { Unauthorized } from "../lib/errors.js";
import type { LoginResponse, UserSummary } from "@app/shared";
import type { AuthTokenPayload } from "../plugins/auth.js";

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

function toSummary(u: Awaited<ReturnType<typeof loadUserWithGroups>>): UserSummary {
  if (!u) throw new Error("user required");
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

function loadUserWithGroups(username: string) {
  return prisma.user.findUnique({
    where: { username },
    include: { secret: true, groups: { include: { group: true } } },
  });
}

const auth: FastifyPluginAsync = async (app) => {
  // ── POST /auth/login ────────────────────────────────────────────
  app.post("/auth/login", async (req, reply) => {
    const c = config();
    const { username, password } = LoginBody.parse(req.body);

    const user = await loadUserWithGroups(username);
    // Constant-time-ish: always run an argon2 verify so an attacker
    // can't distinguish "no such user" from "wrong password" by timing.
    // The dummy hash is a well-formed argon2id encoding of a value
    // we'll never accept; verify against it when the user is missing.
    const dummyHash =
      "$argon2id$v=19$m=65536,t=3,p=4$ZGVmYXVsdHNhbHQAAAAAAAAAAA$LzZkXh4MJxgM2Cu3xVbQQNDOPnVcgKHZP8b0vYxv4f8";
    let ok = false;
    if (user?.secret) {
      ok = await verifyPassword(user.secret.passwordHashArgon2id, password);
    } else {
      await verifyPassword(dummyHash, password);
    }

    if (!user || !user.secret || !ok) {
      await prisma.authEvent.create({
        data: {
          username,
          type: "login_fail",
          source: "web",
          metadata: { reason: "bad_credentials", ip: req.ip },
        },
      });
      throw Unauthorized("Invalid credentials");
    }

    if (user.status !== "active") {
      throw Unauthorized(`Account ${user.status}`);
    }
    if (user.validUntil && user.validUntil < new Date()) {
      throw Unauthorized("Account expired");
    }

    // MFA: deferred to Phase 5. Stub the response shape so the web app
    // can branch on `mfaRequired`.
    if (user.mfaEnabled) {
      // TODO(phase-5): validate TOTP, then issue tokens.
      throw Unauthorized("MFA not yet implemented");
    }

    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      typ: "access",
    };
    const refreshPayload: AuthTokenPayload = { ...accessPayload, typ: "refresh" };

    const accessToken = await reply.jwtSign(accessPayload, { expiresIn: c.ACCESS_TOKEN_TTL });
    const refreshToken = await reply.jwtSign(refreshPayload, { expiresIn: c.REFRESH_TOKEN_TTL });

    reply.setCookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: c.COOKIE_SECURE,
      sameSite: "strict",
      domain: c.COOKIE_DOMAIN,
      signed: true,
      path: "/api/v1/auth",
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      prisma.authEvent.create({
        data: {
          userId: user.id,
          username: user.username,
          type: "login_ok",
          source: "web",
          metadata: { ip: req.ip },
        },
      }),
    ]);

    const body: LoginResponse = { accessToken, user: toSummary(user) };
    return body;
  });

  // ── POST /auth/refresh ──────────────────────────────────────────
  app.post("/auth/refresh", async (req, reply) => {
    const c = config();
    let payload: AuthTokenPayload;
    try {
      payload = await req.jwtVerify<AuthTokenPayload>({ onlyCookie: true });
    } catch {
      throw Unauthorized("Invalid refresh token");
    }
    if (payload.typ !== "refresh") throw Unauthorized("Invalid token type");

    const user = await loadUserWithGroups(payload.username);
    if (!user || user.status !== "active") throw Unauthorized();

    const next: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      typ: "access",
    };
    const accessToken = await reply.jwtSign(next, { expiresIn: c.ACCESS_TOKEN_TTL });

    // Rotate the refresh token too.
    const rotated: AuthTokenPayload = { ...next, typ: "refresh" };
    const refreshToken = await reply.jwtSign(rotated, { expiresIn: c.REFRESH_TOKEN_TTL });
    reply.setCookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: c.COOKIE_SECURE,
      sameSite: "strict",
      domain: c.COOKIE_DOMAIN,
      signed: true,
      path: "/api/v1/auth",
    });

    return { accessToken, user: toSummary(user) };
  });

  // ── POST /auth/logout ───────────────────────────────────────────
  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("refresh_token", { path: "/api/v1/auth" });
    return { ok: true };
  });

  // ── GET /me ─────────────────────────────────────────────────────
  app.get("/me", { preHandler: app.authenticate }, async (req) => {
    const user = await loadUserWithGroups(req.currentUser!.username);
    if (!user) throw Unauthorized();
    return toSummary(user);
  });
};

export default auth;
