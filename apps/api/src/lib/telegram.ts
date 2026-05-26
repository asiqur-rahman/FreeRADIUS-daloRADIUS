// ─────────────────────────────────────────────────────────────────────
//  Telegram bot — approval notifications for new device connections.
//
//  Uses long-polling (getUpdates) — no public webhook URL required.
//  Call startTelegramPolling() once at server startup.
//
//  Required env vars:
//    TELEGRAM_BOT_TOKEN       from @BotFather
//    TELEGRAM_ADMIN_CHAT_ID   your personal chat ID (message @userinfobot)
// ─────────────────────────────────────────────────────────────────────

import pino from "pino";
import { config } from "../config.js";
import { decideDevice } from "../services/deviceApprovals.js";

const log = pino({ name: "telegram" });

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
 * Does nothing if Telegram credentials are not configured.
 */
export async function sendApprovalRequest(opts: {
  deviceId: string;
  username: string;
  fullName: string | null;
  mac: string;
  nasIp: string;
}): Promise<void> {
  const c = config();
  if (!c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_ADMIN_CHAT_ID) return;

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

  await tgCall(c.TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: c.TELEGRAM_ADMIN_CHAT_ID,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve:${opts.deviceId}` },
        { text: "❌ Reject",  callback_data: `reject:${opts.deviceId}`  },
      ]],
    },
  });
}

// ── Long-polling loop ──────────────────────────────────────────────

let pollingActive = false;

export function startTelegramPolling(): void {
  const c = config();
  if (!c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_ADMIN_CHAT_ID) {
    log.info("telegram disabled — TELEGRAM_BOT_TOKEN not set");
    return;
  }
  if (pollingActive) return;
  pollingActive = true;
  void pollLoop(c.TELEGRAM_BOT_TOKEN, c.TELEGRAM_ADMIN_CHAT_ID);
  log.info("telegram polling started");
}

export function stopTelegramPolling(): void {
  pollingActive = false;
}

async function pollLoop(token: string, adminChatId: string): Promise<void> {
  let offset = 0;

  while (pollingActive) {
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
  const action = cb.data.slice(0, colonIdx);
  const deviceId = cb.data.slice(colonIdx + 1);

  if (!deviceId || (action !== "approve" && action !== "reject")) return;

  const newStatus = action === "approve" ? ("approved" as const) : ("rejected" as const);
  const emoji = action === "approve" ? "✅" : "❌";

  const decision = await decideDevice({
    deviceId,
    status: newStatus,
    actorLabel: cb.from.first_name,
    source: "telegram",
    notes: `${newStatus} via Telegram by ${cb.from.first_name}`,
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

  // Edit the original message (replaces the buttons with the decision).
  if (cb.message) {
    await tgCall(token, "editMessageText", {
      chat_id:    cb.message.chat.id,
      message_id: cb.message.message_id,
      text:       replyText,
      parse_mode: "Markdown",
    }).catch(() =>
      // Fall back to a new message if the original was deleted.
      tgCall(token, "sendMessage", {
        chat_id: adminChatId, text: replyText, parse_mode: "Markdown",
      }),
    );
  }

  log.info(
    {
      deviceId,
      mac: decision.device.mac,
      username: decision.device.user.username,
      newStatus,
      reauthAttempts: decision.disconnectAttempts.length,
      alreadyApplied: decision.alreadyApplied,
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
  id: string;
  from: { first_name: string };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
