import { createHash } from "node:crypto";
import { config } from "../config.js";
import { AppError, BadRequest, ServiceUnavailable } from "./errors.js";

export async function assertPasswordNotBreached(password: string) {
  const c = config();
  if (!c.HIBP_CHECK_ENABLED) return;

  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "radius-platform-password-policy" },
      signal: AbortSignal.timeout(c.HIBP_TIMEOUT_MS),
    });
    if (!response.ok) throw ServiceUnavailable("Password breach screening is temporarily unavailable");
    const breached = (await response.text())
      .split(/\r?\n/)
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
    if (breached) {
      throw BadRequest("This password appears in known breach data. Choose another password.");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw ServiceUnavailable("Password breach screening is temporarily unavailable");
  }
}
