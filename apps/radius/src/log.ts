// Pino logger. Initialisation is deferred to first use so test files
// can set env vars after this module has been imported — otherwise the
// `config()` call would `process.exit(1)` during static-import phase.
import pino, { type Logger } from "pino";
import { config } from "./config.js";

let cached: Logger | undefined;

function build(): Logger {
  const c = config();
  return pino({
    level: c.LOG_LEVEL,
    transport:
      c.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
        : undefined,
  });
}

/**
 * Lazy pino instance. Every call routes through `build()` on first
 * access; later calls return the cached singleton.
 *
 * The proxy lets call-sites keep the familiar `log.info(...)` syntax
 * without each one paying an `if (!log) log = ...` branch.
 */
export const log: Logger = new Proxy({} as Logger, {
  get(_target, prop) {
    if (!cached) cached = build();
    const value = (cached as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as Function).bind(cached) : value;
  },
});
