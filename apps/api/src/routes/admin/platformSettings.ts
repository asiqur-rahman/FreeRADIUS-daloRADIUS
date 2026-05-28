// ─────────────────────────────────────────────────────────────────────
//  Admin platform settings routes.
//
//  GET  /admin/settings/platform  — read all configurable settings
//  PUT  /admin/settings/platform  — update settings (partial)
//
//  Sensitive values (bot tokens) are masked on GET.
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getTelegramSettings,
  saveTelegramSettings,
  reloadTelegramPolling,
  stopTelegramPolling,
} from "../../lib/telegram.js";

function maskSecret(value: string | null): string | null {
  if (!value || value.length < 8) return value ? "***" : null;
  return value.slice(0, 4) + "…" + value.slice(-4);
}

const PatchBody = z.object({
  telegram: z
    .object({
      botToken:    z.string().max(200).nullable().optional(),
      adminChatId: z.string().max(50).nullable().optional(),
    })
    .optional(),
});

const adminPlatformSettings: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // ── GET /admin/settings/platform ────────────────────────────────
  app.get("/settings/platform", async () => {
    const tg = await getTelegramSettings();
    return {
      telegram: {
        botToken:    maskSecret(tg.botToken),
        adminChatId: tg.adminChatId,   // not secret — just a numeric ID
        configured:  Boolean(tg.botToken && tg.adminChatId),
      },
    };
  });

  // ── PUT /admin/settings/platform ────────────────────────────────
  app.put<{ Body: z.infer<typeof PatchBody> }>("/settings/platform", async (req, reply) => {
    const body = PatchBody.parse(req.body);

    if (body.telegram !== undefined) {
      const current = await getTelegramSettings();

      // Treat a masked token (ends with …) or unchanged display value as
      // "no change" — the frontend sends back what it received on GET.
      const rawToken = body.telegram.botToken;
      const newToken =
        rawToken === undefined
          ? undefined
          : rawToken === null
            ? null
            : rawToken.includes("…")
              ? undefined // masked — don't overwrite
              : rawToken.trim() || null;

      const newChatId =
        body.telegram.adminChatId === undefined
          ? undefined
          : body.telegram.adminChatId?.trim() || null;

      const changes: { botToken?: string | null; adminChatId?: string | null } = {};
      if (newToken !== undefined) changes.botToken = newToken;
      if (newChatId !== undefined) changes.adminChatId = newChatId;

      if (Object.keys(changes).length > 0) {
        await saveTelegramSettings(changes);

        // Only restart polling if credentials actually changed
        const freshToken   = changes.botToken    !== undefined ? changes.botToken    : current.botToken;
        const freshChatId  = changes.adminChatId !== undefined ? changes.adminChatId : current.adminChatId;
        if (freshToken && freshChatId) {
          await reloadTelegramPolling();
        } else {
          // Credentials incomplete or cleared — stop any running poll loop.
          stopTelegramPolling();
        }
      }
    }

    const tg = await getTelegramSettings();
    return reply.status(200).send({
      telegram: {
        botToken:    maskSecret(tg.botToken),
        adminChatId: tg.adminChatId,
        configured:  Boolean(tg.botToken && tg.adminChatId),
      },
    });
  });
};

export default adminPlatformSettings;
