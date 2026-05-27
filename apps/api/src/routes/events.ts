// ─────────────────────────────────────────────────────────────────────
//  Server-Sent Events endpoint for the admin dashboard.
//
//  GET /api/v1/events?token=<jwt>
//
//  The token is accepted as a query parameter because the browser
//  EventSource API cannot set arbitrary request headers.  The JWT is
//  the same access token issued at login.
//
//  Events emitted:
//    device.pending  — a new device connected and needs a decision
//    device.decided  — an admin (or Telegram) approved/rejected a device
//
//  Keep-alive comments (": ping") are sent every 25 s so proxies and
//  load balancers don't close idle connections.
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { subscribePlatformEvents } from "../lib/events.js";

const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { token?: string } }>("/events", async (req, reply) => {
    // EventSource can't set Authorization headers → accept token in QS
    const qs = req.query.token;
    if (qs) {
      req.headers.authorization = `Bearer ${qs}`;
    }

    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // ── Switch to SSE mode ───────────────────────────────────────────
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    reply.raw.flushHeaders();

    // Initial comment so the browser fires EventSource.onopen immediately
    reply.raw.write(": connected\n\n");

    // Keep-alive ping every 25 s
    const ping = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(": ping\n\n");
    }, 25_000);

    // Subscribe to platform events and forward them as SSE frames
    const unsubscribe = subscribePlatformEvents((event) => {
      if (reply.raw.destroyed) return;
      const data = JSON.stringify({ ...event.payload, timestamp: event.timestamp });
      reply.raw.write(`event: ${event.type}\ndata: ${data}\n\n`);
    });

    // Clean up when the client disconnects
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });

    // Suspend the handler — Fastify must not send a normal reply
    await new Promise<void>((resolve) => req.raw.on("close", resolve));
  });
};

export default eventsRoutes;
