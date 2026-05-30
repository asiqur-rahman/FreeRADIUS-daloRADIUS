// ─────────────────────────────────────────────────────────────────────
//  Telegram bot — approval notifications for new device connections.
//
//  Uses long-polling (getUpdates) — no public webhook URL required.
//
//  Configuration priority (highest → lowest):
//    1. platform_settings table (admin panel)
//    2. TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID env vars
//
//  Call startTelegramPolling() once at server startup.
//  Call reloadTelegramPolling() after saving new settings — it stops
//  the current loop and restarts with the fresh credentials.
// ─────────────────────────────────────────────────────────────────────

import pino from "pino";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { decideDevice } from "../services/deviceApprovals.js";

const log = pino({ name: "telegram" });

// ── DB-backed settings ─────────────────────────────────────────────

const SETTING_TOKEN   = "telegram.bot_token";
const SETTING_CHAT_ID = "telegram.admin_chat_id";

export interface TelegramSettings {
  botToken:    string | null;
  adminChatId: string | null;
}

/** Read settings from DB, fall back to env. */
export async function getTelegramSettings(): Promise<TelegramSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [SETTING_TOKEN, SETTING_CHAT_ID] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const c = config();
  return {
    botToken:    map.get(SETTING_TOKEN)   || c.TELEGRAM_BOT_TOKEN    || null,
    adminChatId: map.get(SETTING_CHAT_ID) || c.TELEGRAM_ADMIN_CHAT_ID || null,
  };
}

/** Persist new Telegram credentials to the DB. */
export async function saveTelegramSettings(settings: {
  botToken?: string | null;
  adminChatId?: string | null;
}): Promise<void> {
  const ops: Promise<unknown>[] = [];

  if (settings.botToken !== undefined) {
    if (settings.botToken) {
      ops.push(prisma.platformSetting.upsert({
        where: { key: SETTING_TOKEN },
        create: { key: SETTING_TOKEN, value: settings.botToken },
        update: { value: settings.botToken },
      }));
    } else {
      ops.push(prisma.platformSetting.deleteMany({ where: { key: SETTING_TOKEN } }));
    }
  }

  if (settings.adminChatId !== undefined) {
    if (settings.adminChatId) {
      ops.push(prisma.platformSetting.upsert({
        where: { key: SETTING_CHAT_ID },
        create: { key: SETTING_CHAT_ID, value: settings.adminChatId },
        update: { value: settings.adminChatId },
      }));
    } else {
      ops.push(prisma.platformSetting.deleteMany({ where: { key: SETTING_CHAT_ID } }));
    }
  }

  await Promise.all(ops);
}

// ── Telegram HTTP helpers ──────────────────────────────────────────

function apiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function tgCall<T = unknown>(
  token: string,
  method: string,
  body?: object,
): Promise<T> {
  const resp = await fetch(apiUrl(token, method), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Telegram ${method} → ${resp.status}: ${text}`);
  }
  return resp.json() as T;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Send an approval request message to the admin with Approve/Reject buttons.
 * Returns the chat_id and message_id so they can be stored for later editing.
 * Returns null if Telegram credentials are not configured.
 */
export async function sendApprovalRequest(opts: {
  deviceId: string;
  username: string;
  fullName: string | null;
  mac: string;
  nasIp: string;
}): Promise<{ chatId: number; messageId: number } | null> {
  const { botToken, adminChatId } = await getTelegramSettings();
  if (!botToken || !adminChatId) return null;

  const displayName = opts.fullName ? `${opts.username} (${opts.fullName})` : opts.username;
  const text = [
    "📶 *New Wi-Fi Connection Request*",
    "",
    `👤 User: \`${displayName}\``,
    `📱 Device MAC: \`${opts.mac}\``,
    `🌐 AP: \`${opts.nasIp}\``,
    "",
    "Approve to grant normal access, or reject to block this device.",
  ].join("\n");

  const result = await tgCall<{ result: { message_id: number; chat: { id: number } } }>(
    botToken,
    "sendMessage",
    {
      chat_id:      adminChatId,
      text,
      parse_mode:   "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve:${opts.deviceId}` },
          { text: "❌ Reject",  callback_data: `reject:${opts.deviceId}`  },
        ]],
      },
    },
  );

  return {
    chatId:    result.result.chat.id,
    messageId: result.result.message_id,
  };
}

/**
 * Edit the approval message after a web-side decision so Telegram stays in sync.
 * Reads chat/message IDs directly from UserDevice (no DeviceApproval table).
 */
export async function notifyTelegramDecision(opts: {
  deviceId:    string;
  status:      "approved" | "rejected" | "blocked";
  deciderName: string;
}): Promise<void> {
  const { botToken, adminChatId } = await getTelegramSettings();
  if (!botToken || !adminChatId) return;

  const device = await prisma.userDevice.findUnique({
    where:   { id: opts.deviceId },
    include: { user: { select: { username: true, fullName: true } } },
  });
  if (!device?.telegramMessageId || !device.telegramChatId) return;

  const emoji = opts.status === "approved" ? "✅" : opts.status === "blocked" ? "🚫" : "❌";
  const displayName = device.user.fullName
    ? `${device.user.username} (${device.user.fullName})`
    : device.user.username;

  const replyText = [
    `${emoji} *${opts.status.toUpperCase()}* — via dashboard`,
    `\`${device.mac}\` - ${displayName}`,
    `_Decided by ${opts.deciderName}_`,
  ].join("\n");

  const chatId = Number(device.telegramChatId);
  await tgCall(botToken, "editMessageText", {
    chat_id:    chatId,
    message_id: device.telegramMessageId,
    text:       replyText,
    parse_mode: "Markdown",
  }).catch(() =>
    tgCall(botToken, "sendMessage", {
      chat_id: adminChatId, text: replyText, parse_mode: "Markdown",
    }),
  );
}

// ── Long-polling loop ──────────────────────────────────────────────

let pollingActive = false;
let pollingToken: string | null = null;

export function startTelegramPolling(): void {
  void _startAsync();
}

async function _startAsync(): Promise<void> {
  if (pollingActive) return;

  const { botToken, adminChatId } = await getTelegramSettings();
  if (!botToken || !adminChatId) {
    log.info("telegram disabled — credentials not configured");
    return;
  }

  pollingActive = true;
  pollingToken  = botToken;
  void pollLoop(botToken, adminChatId);
  log.info("telegram polling started");
}

export function stopTelegramPolling(): void {
  pollingActive = false;
  pollingToken  = null;
}

/** Stop the current loop and restart with fresh credentials from the DB. */
export async function reloadTelegramPolling(): Promise<void> {
  stopTelegramPolling();
  // Give the loop one iteration to notice pollingActive = false
  await sleep(200);
  void _startAsync();
}

async function pollLoop(token: string, adminChatId: string): Promise<void> {
  let offset = 0;

  while (pollingActive && pollingToken === token) {
    try {
      const res = await tgCall<{ result: TgUpdate[] }>(token, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["callback_query"],
      });

      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.callback_query) {
          await handleCallback(update.callback_query, token, adminChatId).catch((err) => {
            log.error({ err }, "telegram callback handler error");
          });
        }
      }
    } catch (err) {
      log.warn({ err }, "telegram poll error — retrying in 5 s");
      await sleep(5_000);
    }
  }

  log.info("telegram polling stopped");
}

// ── Callback handler ───────────────────────────────────────────────

async function handleCallback(
  cb: TgCallbackQuery,
  token: string,
  adminChatId: string,
): Promise<void> {
  // Acknowledge the button press immediately so Telegram stops spinning.
  await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});

  if (!cb.data) return;
  const colonIdx = cb.data.indexOf(":");
  const action   = cb.data.slice(0, colonIdx);
  const deviceId = cb.data.slice(colonIdx + 1);

  if (!deviceId || (action !== "approve" && action !== "reject")) return;

  const newStatus  = action === "approve" ? ("approved" as const) : ("rejected" as const);
  const emoji      = action === "approve" ? "✅" : "❌";
  const deciderName = cb.from.first_name ?? cb.from.username ?? "Telegram admin";

  const decision = await decideDevice({
    deviceId,
    status:     newStatus,
    actorLabel: deciderName,
    source:     "telegram",
    notes:      `${newStatus} via Telegram by ${deciderName}`,
  });

  const displayName = decision.device.user.fullName
    ? `${decision.device.user.username} (${decision.device.user.fullName})`
    : decision.device.user.username;

  const replyText = [
    `${emoji} *${newStatus.toUpperCase()}*`,
    `\`${decision.device.mac}\` - ${displayName}`,
    decision.disconnectAttempts.length > 0
      ? `_Forced reauthentication for ${decision.disconnectAttempts.length} active session(s)._`
      : decision.alreadyApplied
        ? "_This decision was already applied._"
        : "_No active session needed reauthentication._",
  ].join("\n");

  if (cb.message) {
    await tgCall(token, "editMessageText", {
      chat_id:    cb.message.chat.id,
      message_id: cb.message.message_id,
      text:       replyText,
      parse_mode: "Markdown",
    }).catch(() =>
      tgCall(token, "sendMessage", {
        chat_id: adminChatId, text: replyText, parse_mode: "Markdown",
      }),
    );
  }

  log.info(
    {
      deviceId,
      mac:             decision.device.mac,
      username:        decision.device.user.username,
      newStatus,
      reauthAttempts:  decision.disconnectAttempts.length,
      alreadyApplied:  decision.alreadyApplied,
    },
    "telegram.device_decision",
  );
}

// ── Types ──────────────────────────────────────────────────────────

interface TgUpdate {
  update_id: number;
  callback_query?: TgCallbackQuery;
}

interface TgCallbackQuery {
  id:       string;
  from:     { first_name?: string; username?: string };
  message?: { message_id: number; chat: { id: number } };
  data?:    string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
