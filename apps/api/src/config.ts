// ─────────────────────────────────────────────────────────────────────
//  Centralised, validated environment configuration.
//  Imported anywhere the app needs env values — no `process.env`
//  access elsewhere in the codebase.
// ─────────────────────────────────────────────────────────────────────
import { z } from "zod";

const envBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),

  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 chars"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: envBoolean.default(false),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

  ARGON2_MEMORY: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(4),

  MFA_ENCRYPTION_KEY: z.string().min(32).default("dev_mfa_encryption_key_change_before_use_2026"),
  REQUIRE_ADMIN_MFA: envBoolean.default(false),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  HIBP_CHECK_ENABLED: envBoolean.default(false),
  HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  COA_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  COA_DISCONNECT_ON_PASSWORD_CHANGE: envBoolean.default(true),
  COA_DISCONNECT_ON_USER_POLICY_CHANGE: envBoolean.default(true),
  COA_DISCONNECT_ON_GROUP_POLICY_CHANGE: envBoolean.default(false),

  ALERT_NAS_SILENT_MINUTES: z.coerce.number().int().positive().default(15),
  ALERT_REJECT_THRESHOLD_5M: z.coerce.number().int().positive().default(20),

  DEVICE_CERT_CA_CERT_PEM: z.string().optional(),
  DEVICE_CERT_CA_KEY_PEM: z.string().optional(),
  DEVICE_CERT_CA_CERT_PATH: z.string().optional(),
  DEVICE_CERT_CA_KEY_PATH: z.string().optional(),
  DEVICE_CERT_CA_KEY_PASSPHRASE: z.string().optional(),
  DEVICE_CERT_VALIDITY_DAYS: z.coerce.number().int().min(1).max(397).default(365),
  DEVICE_CERT_SUBJECT_ORGANIZATION: z.string().default("RadiusOps"),
  DEVICE_CERT_SUBJECT_ORGANIZATIONAL_UNIT: z.string().default("Managed WiFi"),
  DEVICE_CERT_SUBJECT_COUNTRY: z
    .string()
    .trim()
    .length(2, "DEVICE_CERT_SUBJECT_COUNTRY must be a 2-letter ISO code")
    .optional(),
  DEVICE_CERT_SUBJECT_STATE: z.string().optional(),
  DEVICE_CERT_SUBJECT_LOCALITY: z.string().optional(),

  // ── FreeRADIUS rlm_rest hook ─────────────────────────────────────
  // Shared secret checked on every /radius/* request (X-Radius-Hook-Secret).
  RADIUS_HOOK_SECRET: z.string().min(16).default("dev-hook-secret-change-in-prod"),

  // When true the /radius/* preHandler also enforces the IP allowlist
  // stored in radius_allowed_ips (admin Settings → RADIUS IP Guard).
  // Set to false for local dev / lab convenience.
  RADIUS_IP_GUARD_ENABLED: envBoolean.default(false),

  // VLAN IDs returned to the AP via Tunnel-Private-Group-ID.
  QUARANTINE_VLAN_ID: z.coerce.number().int().positive().default(99),
  NORMAL_VLAN_ID:     z.coerce.number().int().positive().default(10),

  // ── Telegram bot ────────────────────────────────────────────────
  // Get BOT_TOKEN from @BotFather.  Get ADMIN_CHAT_ID by messaging @userinfobot.
  TELEGRAM_BOT_TOKEN:     z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
