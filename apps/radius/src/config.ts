// Centralised, validated environment config — mirrors the API's pattern.
import { z } from "zod";

const envBoolean = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // UDP bind. Defaults: 1812 (auth) + 1813 (accounting), per IANA.
  RADIUS_HOST: z.string().default("0.0.0.0"),
  RADIUS_AUTH_PORT: z.coerce.number().int().min(1).max(65535).default(1812),
  RADIUS_ACCT_PORT: z.coerce.number().int().min(1).max(65535).default(1813),
  // RFC 5176 dynamic-auth port. We listen so we can NAK politely;
  // outbound CoA from this server is on an ephemeral source port.
  RADIUS_COA_PORT: z.coerce.number().int().min(1).max(65535).default(3799),

  DATABASE_URL: z.string().min(1),

  // How long NAS lookups stay cached. Short enough that a NAS update
  // from the admin UI propagates quickly; long enough to keep the
  // hot path off the DB.
  NAS_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // Reject Access-Requests that lack a Message-Authenticator? RFC 5080
  // strongly recommends; FreeRADIUS treats it as MUST for EAP. We
  // default ON because Phase A2's first auth method will be EAP.
  REQUIRE_MESSAGE_AUTHENTICATOR: envBoolean.default(true),

  // EAP method preference. Resolution order is EAP-TLS > PEAP >
  // EAP-MSCHAPv2; the first enabled method wins. The supplicant can
  // still EAP-Nak to negotiate down, but our radio offer starts here.
  EAP_TLS_ENABLED: envBoolean.default(false),
  PEAP_ENABLED: envBoolean.default(false),

  // PEM paths for the TLS server cert + key (PEAP / EAP-TLS). Leave
  // blank in dev to use the auto-generated self-signed fallback.
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),

  // Identity advertised inside MSCHAPv2 server-name slot (visible in
  // some supplicants' "server name" UI).
  RADIUS_SERVER_NAME: z.string().default("radius-platform"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid RADIUS server config:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
