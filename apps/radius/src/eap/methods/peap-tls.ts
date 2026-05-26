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
  /** Set true synchronously inside the 'secure' event handler — this is
   *  the authoritative signal that handshake is done. Polling
   *  `socket.getSession()` was unreliable across Node versions. */
  handshakeComplete: boolean;
  /** Captured TLS error (if any) for graceful reject after fragmented send. */
  handshakeError: Error | null;
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
    // Curated cipher list. The defaults Node ships include suites Windows
    // 10/11 PEAP supplicants reject (they require RFC 5246 mandatory
    // suites with PFS). This list works across Windows, macOS, iOS,
    // Android, and wpa_supplicant.
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES256-SHA384",
      "ECDHE-RSA-AES128-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
      "AES256-SHA256",
      "AES128-SHA256",
    ].join(":"),
  });

  const socket = new TLSSocket(bridge, {
    isServer: true,
    secureContext,
    requestCert: cfg.requestClientCert ?? false,
    // PEAP doesn't validate the supplicant cert at the TLS layer.
    rejectUnauthorized: false,
  });

  const session: TlsSession = {
    socket,
    bridge,
    ready: null as unknown as Promise<void>, // set below
    inboundCleartext: [],
    handshakeComplete: false,
    handshakeError: null,
  };

  socket.on("data", (chunk: Buffer) => {
    session.inboundCleartext.push(chunk);
  });

  // 'secure' fires once the TLS handshake completes. Setting the flag
  // synchronously inside the handler is the only reliable signal —
  // `getSession()` may return undefined for several ticks afterwards.
  session.ready = new Promise<void>((resolve, reject) => {
    socket.once("secure", () => {
      session.handshakeComplete = true;
      resolve();
    });
    socket.once("error", (err) => {
      session.handshakeError = err;
      reject(err);
    });
  });

  return session;
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
 * Drain TLS output after letting Node's TLS state machine fully
 * process the latest input. We yield to the event loop a bounded
 * number of times — each `setImmediate` lets TLS push more records
 * into the bridge — then drain whatever has accumulated.
 *
 * This is preferable to a wall-clock timeout: TLS handshake records
 * arrive in a deterministic number of microtasks (typically 1–3 per
 * inbound record), so once those have flushed, no further yields
 * will produce more bytes.
 */
export async function flushTlsOutput(session: TlsSession, maxYields = 8): Promise<Buffer> {
  for (let i = 0; i < maxYields; i++) {
    await new Promise<void>((r) => setImmediate(r));
    // If TLS errored, stop pumping — caller will see the error via session.handshakeError.
    if (session.handshakeError) break;
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
