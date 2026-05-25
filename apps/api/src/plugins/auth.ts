// ─────────────────────────────────────────────────────────────────────
//  Auth plugin — JWT verification + role-based authorisation.
//
//  Access tokens (short-lived) ride in the Authorization header.
//  Refresh tokens (long-lived) ride in an HttpOnly cookie and are
//  rotated by the /auth/refresh endpoint.
// ─────────────────────────────────────────────────────────────────────
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { UserRole } from "@app/shared";
import { config } from "../config.js";
import { Forbidden, Unauthorized } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    authorize: (roles: UserRole[]) => (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser?: AuthTokenPayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

export interface AuthTokenPayload {
  sub: string;     // user id
  username: string;
  role: UserRole;
  // 'refresh' tokens carry tokenVersion; absent on access tokens.
  typ: "access" | "refresh";
}

const plugin: FastifyPluginAsync = async (app) => {
  const c = config();

  await app.register(cookie, { secret: c.COOKIE_SECRET });
  await app.register(jwt, {
    secret: c.JWT_SECRET,
    cookie: { cookieName: "refresh_token", signed: true },
    sign: { expiresIn: c.ACCESS_TOKEN_TTL },
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      const payload = await req.jwtVerify<AuthTokenPayload>();
      if (payload.typ !== "access") throw Unauthorized("Invalid token type");
      req.currentUser = payload;
    } catch (err) {
      if (err instanceof Error && err.name === "AppError") throw err;
      throw Unauthorized();
    }
  });

  app.decorate("authorize", (roles: UserRole[]) => async (req: FastifyRequest) => {
    if (!req.currentUser) throw Unauthorized();
    if (!roles.includes(req.currentUser.role)) throw Forbidden("Insufficient role");
  });
};

export default fp(plugin, { name: "auth" });
