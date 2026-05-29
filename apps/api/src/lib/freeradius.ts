// ──────────────────────────────────────────────────────────────────────────────
//  FreeRADIUS service control helper.
//
//  When a NAS client is added, updated, or deleted the `nas` table is updated
//  synchronously.  On setups where FreeRADIUS caches NAS entries in memory, a
//  reload / restart is needed to pick up the change immediately.
//
//  The reload command is stored in platform_settings (key: freeradius.reload_command)
//  with env-var fallback (FREERADIUS_RELOAD_COMMAND).  Configure it from the
//  admin Settings panel.
//
//  Recommended command values (leave blank to disable):
//    systemctl reload freeradius             — graceful SIGHUP, keeps active sessions
//    systemctl restart freeradius            — full restart, drops active sessions
//    sudo kill -HUP $(cat /var/run/freeradius/freeradius.pid)
//    radmin -e "hup server"                  — FreeRADIUS 3.x management socket
//    docker compose exec freeradius kill -HUP 1
//
//  A failed reload is logged but does NOT abort the NAS mutation — the database
//  is always the source of truth; the worst case is that FreeRADIUS picks up the
//  change after its next scheduled reload or manual restart.
// ──────────────────────────────────────────────────────────────────────────────

import { exec }      from "node:child_process";
import { promisify } from "node:util";
import { prisma }    from "../db.js";
import { config }    from "../config.js";

const execAsync = promisify(exec);
const RELOAD_CMD_KEY = "freeradius.reload_command";
const RELOAD_TIMEOUT_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FreeRadiusReloadResult {
  triggered: boolean;
  success:   boolean;
  stdout?:   string;
  stderr?:   string;
  error?:    string;
}

// ── DB-backed command storage ─────────────────────────────────────────────────

export async function getReloadCommand(): Promise<string | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: RELOAD_CMD_KEY } });
  // DB first, env-var fallback, empty string = disabled
  const cmd = row?.value?.trim() ?? config().FREERADIUS_RELOAD_COMMAND?.trim() ?? "";
  return cmd || null;
}

export async function saveReloadCommand(cmd: string | null): Promise<void> {
  const value = cmd?.trim() ?? "";
  await prisma.platformSetting.upsert({
    where:  { key: RELOAD_CMD_KEY },
    create: { key: RELOAD_CMD_KEY, value },
    update: { value },
  });
}

// ── Reload trigger ─────────────────────────────────────────────────────────────

/**
 * Execute the configured reload command.
 * Returns `{ triggered: false }` when no command is configured (safe no-op).
 * Never throws — a failed reload is non-fatal (DB is already up-to-date).
 */
export async function reloadFreeRadius(): Promise<FreeRadiusReloadResult> {
  let cmd: string | null;
  try {
    cmd = await getReloadCommand();
  } catch {
    return { triggered: false, success: false };
  }

  if (!cmd) return { triggered: false, success: false };

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: RELOAD_TIMEOUT_MS });
    return {
      triggered: true,
      success:   true,
      stdout:    stdout.trim() || undefined,
      stderr:    stderr.trim() || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[freeradius] reload command failed: ${message}`);
    return {
      triggered: true,
      success:   false,
      error:     message,
    };
  }
}
