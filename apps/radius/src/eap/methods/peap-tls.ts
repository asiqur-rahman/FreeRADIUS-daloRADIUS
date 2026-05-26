// ─────────────────────────────────────────────────────────────────────
//  TLS adapter for PEAP / EAP-TLS.
//
//  Node's TLSSocket is built for TCP. We hand-roll a Duplex that:
//   • Stores TLS handshake/encrypted output bytes the TLSSocket "writes"
//     to it, so the EAP layer can collect them into a PEAP fragment.
//   • Lets the EAP layer feed in inbound TLS bytes (from the supplicant)
//     by calling feedIn() — pushed into the Duplex's readable side.
//
//  This pattern (custom Duplex + new TLSSocket(duplex, {isServer:true}))
//  is the same trick FreeRADIUS uses with OpenSSL memory BIOs, just
//  expressed via Node's stream API.
// ─────────────────────────────────────────────────────────────────────

import { Duplex } from "node:stream";
import { TLSSocket, createSecureContext, type SecureContext } from "node:tls";

class TlsBridge extends Duplex {
  /** Bytes the TLSSocket wants to send out (handshake records or encrypted app data). */
  private readonly outbox: Buffer[] = [];

  constructor() {
    super({ allowHalfOpen: true });
  }

  override _read(_size: number): void {
    // Nothing to do — TLS data arrives via feedIn().
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    cb: (err?: Error) => void,
  ): void {
    const buf = typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
    this.outbox.push(buf);
    cb();
  }

  /** Feed inbound TLS bytes (from the supplicant) into the TLSSocket. */
  feedIn(bytes: Buffer): void {
    if (bytes.length) this.push(bytes);
  }

  /** Drain all queued outbound TLS bytes since the last call. */
  drainOut(): Buffer {
    if (this.outbox.length === 0) return Buffer.alloc(0);
    const out = Buffer.concat(this.outbox);
    this.outbox.length = 0;
    return out;
  }

  hasPending(): boolean {
    return this.outbox.length > 0;
  }
}

export interface TlsSession {
  /** TLS state machine. */
  socket: TLSSocket;
  /** Duplex the EAP layer uses to push/pull TLS bytes. */
  bridge: TlsBridge;
  /** Resolves when TLS handshake completes; rejects on TLS error. */
  ready: Promise<void>;
  /** Buffered cleartext data the application has received post-handshake. */
  inboundCleartext: Buffer[];
}

export interface TlsConfig {
  cert: Buffer | string;
  key: Buffer | string;
  /** Optional CA bundle for client-cert validation (EAP-TLS in A7). */
  ca?: Buffer | string;
  requestClientCert?: boolean;
}

/**
 * Construct a TLS server-side session ready to receive PEAP handshake
 * fragments. The returned `ready` promise resolves after the handshake.
 */
export function createTlsSession(cfg: TlsConfig): TlsSession {
  const bridge = new TlsBridge();
  const secureContext: SecureContext = createSecureContext({
    cert: cfg.cert,
    key: cfg.key,
    ca: cfg.ca,
    // Keep TLS 1.2 as the upper bound — most enterprise supplicants
    // don't yet negotiate TLS 1.3 over PEAP, and the post-handshake
    // PRF semantics for MSK derivation differ in 1.3.
    maxVersion: "TLSv1.2",
    minVersion: "TLSv1",
  });

  const socket = new TLSSocket(bridge, {
    isServer: true,
    secureContext,
    requestCert: cfg.requestClientCert ?? false,
    // PEAP doesn't validate the supplicant cert at the TLS layer.
    rejectUnauthorized: false,
  });

  const inboundCleartext: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => {
    inboundCleartext.push(chunk);
  });

  const ready = new Promise<void>((resolve, reject) => {
    socket.once("secure", () => resolve());
    socket.once("error", (err) => reject(err));
  });

  return { socket, bridge, ready, inboundCleartext };
}

/**
 * Pull every cleartext byte the app side has buffered, and clear it.
 * Used by the PEAP method after the handshake completes to read inner
 * EAP responses.
 */
export function takeCleartext(session: TlsSession): Buffer {
  if (session.inboundCleartext.length === 0) return Buffer.alloc(0);
  const out = Buffer.concat(session.inboundCleartext);
  session.inboundCleartext.length = 0;
  return out;
}

/**
 * Wait until the bridge has TLS bytes to send, or until the TLS layer
 * indicates there's nothing more to flush. We poll on next-tick because
 * Node's TLS machinery is asynchronous internally.
 */
export async function flushTlsOutput(session: TlsSession, timeoutMs = 100): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  while (!session.bridge.hasPending() && Date.now() < deadline) {
    await new Promise<void>((r) => setImmediate(r));
  }
  return session.bridge.drainOut();
}

/**
 * Derive 64 bytes of keying material from the PEAP TLS session.
 *
 * Uses Node's RFC 5705 exporter ("client EAP encryption" label).
 * MSK = first 32 bytes; the next 32 are typically used as EMSK in
 * other EAP methods.
 *
 * Note: requires TLS ≤ 1.2 because exporter semantics differ in TLS 1.3,
 * and PEAP's MSK derivation is defined against TLS 1.2 PRF.
 */
export function deriveMsk(session: TlsSession): Buffer {
  // Cast: Node's @types/node lacks exportKeyingMaterial on TLSSocket in
  // some versions; the method exists since Node 12.
  const sock = session.socket as TLSSocket & {
    exportKeyingMaterial(len: number, label: string): Buffer;
  };
  if (typeof sock.exportKeyingMaterial !== "function") {
    throw new Error("TLSSocket.exportKeyingMaterial unavailable — Node ≥12 required");
  }
  return sock.exportKeyingMaterial(64, "client EAP encryption");
}
