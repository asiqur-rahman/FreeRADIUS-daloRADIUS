// ─────────────────────────────────────────────────────────────────────
//  TLS material for PEAP / EAP-TLS.
//
//  Production: load PEM cert + private key from configured paths.
//  These are typically the EAP server cert tracked by the EapCertificate
//  model — operators put the same PEM on disk for the radius process
//  and register the fingerprint via the admin UI.
//
//  Dev fallback: if no paths are configured, generate a self-signed
//  cert in-memory at boot. Loud warning in the log; should never be
//  used in production.
// ─────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import selfsigned from "selfsigned";
import { log } from "./log.js";

export interface TlsMaterial {
  cert: Buffer;
  key: Buffer;
  /** True when the material came from a real on-disk PEM, not the dev fallback. */
  fromDisk: boolean;
}

let cached: TlsMaterial | undefined;

export function loadTlsMaterial(opts: {
  certPath?: string;
  keyPath?: string;
}): TlsMaterial {
  if (cached) return cached;

  if (opts.certPath && opts.keyPath) {
    const cert = readFileSync(opts.certPath);
    const key = readFileSync(opts.keyPath);
    cached = { cert, key, fromDisk: true };
    log.info({ certPath: opts.certPath }, "tls.material_loaded");
    return cached;
  }

  log.warn(
    "tls.dev_self_signed_fallback — generating an ephemeral self-signed cert. " +
      "Configure TLS_CERT_PATH / TLS_KEY_PATH for production.",
  );
  const attrs = [{ name: "commonName", value: "radius-platform.local" }];
  const result = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      { name: "basicConstraints", cA: false },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
        clientAuth: true,
      },
    ],
  });
  cached = {
    cert: Buffer.from(result.cert, "utf8"),
    key: Buffer.from(result.private, "utf8"),
    fromDisk: false,
  };
  return cached;
}

/** Used by tests to inject a known cert + key without disk IO. */
export function setTlsMaterialForTesting(material: TlsMaterial): void {
  cached = material;
}

export function clearTlsMaterialCache(): void {
  cached = undefined;
}
