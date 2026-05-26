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
const DEV_FALLBACK_CN = "radius-platform.local";

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
  const attrs = [{ name: "commonName", value: DEV_FALLBACK_CN }];
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
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: DEV_FALLBACK_CN },
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });
  cached = {
    cert: Buffer.from(result.cert, "utf8"),
    key: Buffer.from(result.private, "utf8"),
    fromDisk: false,
  };
  log.info(
    {
      cn: DEV_FALLBACK_CN,
      sanDns: [DEV_FALLBACK_CN, "localhost"],
      sanIp: ["127.0.0.1"],
    },
    "tls.dev_self_signed_ready",
  );
  return cached;
}

/** Used by tests to inject a known cert + key without disk IO. */
export function setTlsMaterialForTesting(material: TlsMaterial): void {
  cached = material;
}

export function clearTlsMaterialCache(): void {
  cached = undefined;
}
