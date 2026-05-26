// ─────────────────────────────────────────────────────────────────────
//  EAP session state store.
//
//  After an Access-Challenge we attach a State attribute (random 16
//  bytes) and remember everything we need to continue: which method
//  is being negotiated, the per-method scratchpad, the EAP identifier
//  we're expecting next, the NAS we trust this state with.
//
//  In-process Map for now. Will move to Redis once we have HA in mind,
//  but for a single radius node the Map is fine — RADIUS sessions are
//  short-lived (seconds) and easy to evict.
// ─────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";

export interface EapSession {
  /** Random 16-byte handle echoed back in the State attribute. */
  stateBytes: Buffer;
  /** Username from the very first Access-Request — pinned for the session. */
  username: string;
  /** NAS id that started the session (cross-NAS state would be a forgery). */
  nasId: string;
  /** EAP method currently in flight (e.g. EapType.MsChapV2). */
  method: number;
  /** Next EAP Identifier the supplicant should send. We bump it each round. */
  nextEapId: number;
  /** Method-specific scratch — challenge bytes for MSCHAPv2, TLS state for PEAP. */
  scratch: Record<string, unknown>;
  /** Created-at for eviction. */
  createdAt: number;
}

const STATE_TTL_MS = 60_000; // 60 s — supplicants finish in under a second
const MAX_SESSIONS = 10_000; // soft cap; protects against state explosion

const store = new Map<string, EapSession>();

export function createEapSession(
  init: Omit<EapSession, "stateBytes" | "createdAt">,
): EapSession {
  evictOld();
  if (store.size >= MAX_SESSIONS) {
    // Eviction policy: drop the oldest 10% by createdAt.
    const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < Math.floor(MAX_SESSIONS / 10); i++) {
      store.delete(sorted[i]![0]);
    }
  }

  const stateBytes = randomBytes(16);
  const session: EapSession = {
    ...init,
    stateBytes,
    createdAt: Date.now(),
  };
  store.set(keyOf(stateBytes), session);
  return session;
}

export function getEapSession(stateBytes: Buffer): EapSession | undefined {
  const session = store.get(keyOf(stateBytes));
  if (!session) return undefined;
  if (Date.now() - session.createdAt > STATE_TTL_MS) {
    store.delete(keyOf(stateBytes));
    return undefined;
  }
  return session;
}

export function deleteEapSession(stateBytes: Buffer): void {
  store.delete(keyOf(stateBytes));
}

export function clearAllEapSessions(): void {
  store.clear();
}

export function evictOld(now = Date.now()): void {
  for (const [k, v] of store) {
    if (now - v.createdAt > STATE_TTL_MS) store.delete(k);
  }
}

function keyOf(stateBytes: Buffer): string {
  return stateBytes.toString("hex");
}
