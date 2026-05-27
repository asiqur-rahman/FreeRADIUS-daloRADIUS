// ─────────────────────────────────────────────────────────────────────
//  In-process platform event bus.
//
//  Emitters (radius.ts, deviceApprovals.ts) call emitPlatformEvent().
//  The SSE route subscribes with subscribePlatformEvents() and streams
//  events to connected admin browsers.
//
//  Using a plain Node.js EventEmitter keeps the dependency footprint
//  minimal and is perfectly sufficient for a single-process deployment.
//  If you ever go multi-process, swap this for a Redis Pub/Sub adapter.
// ─────────────────────────────────────────────────────────────────────

import { EventEmitter } from "node:events";

// ── Event payload types ───────────────────────────────────────────────

export interface DevicePendingPayload {
  deviceId: string;
  username: string;
  fullName: string | null;
  mac: string;
  nasIp: string;
  isNew: boolean;
}

export interface DeviceDecidedPayload {
  deviceId: string;
  username: string;
  mac: string;
  status: "approved" | "rejected";
  source: "telegram" | "admin_api";
}

export type PlatformEventType = "device.pending" | "device.decided";

export interface PlatformEvent {
  type: PlatformEventType;
  payload: DevicePendingPayload | DeviceDecidedPayload;
  timestamp: string; // ISO-8601
}

// ── Singleton emitter ─────────────────────────────────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(200); // one per open SSE connection

const CHANNEL = "platform";

/** Emit a typed platform event to all SSE subscribers. */
export function emitPlatformEvent(
  type: PlatformEventType,
  payload: PlatformEvent["payload"],
): void {
  const event: PlatformEvent = { type, payload, timestamp: new Date().toISOString() };
  emitter.emit(CHANNEL, event);
}

/** Subscribe to all platform events. Returns an unsubscribe function. */
export function subscribePlatformEvents(
  listener: (event: PlatformEvent) => void,
): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}
