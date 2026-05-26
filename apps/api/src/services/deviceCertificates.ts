import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import type { ClientCertificateSummary } from "../lib/clientCertificates.js";
import { parseClientCertificatePem } from "../lib/clientCertificates.js";
import { Conflict, NotFound, ServiceUnavailable } from "../lib/errors.js";
import { decideDevice } from "./deviceApprovals.js";
import { disconnectUserSessions } from "./sessions.js";

interface MutationContext {
  deviceId: string;
  actorId: string;
  actorLabel: string;
  req?: FastifyRequest;
  approve?: boolean;
  notes?: string | null;
}

interface PersistBindingOptions extends MutationContext {
  certificate: ClientCertificateSummary;
  source: "imported" | "issued";
}

interface PersistBindingResult {
  deviceId: string;
  username: string;
  mac: string;
  alreadyBound: boolean;
  approvalChanged: boolean;
  disconnectedSessions: number;
}

export interface DeviceCertificateMutationResult {
  deviceId: string;
  certificate: ClientCertificateSummary | null;
  approvalChanged: boolean;
  disconnectedSessions: number;
}

export interface DeviceCertificateBindingResult extends DeviceCertificateMutationResult {
  alreadyBound: boolean;
}

export interface GeneratedDeviceCertificateResult extends DeviceCertificateBindingResult {
  certificatePem: string;
  privateKeyPem: string;
  pkcs12Base64: string;
  pkcs12Password: string;
}

interface ManagedCaMaterial {
  certPem: string;
  keyPem: string;
  keyPassphrase: string | null;
}

function defaultCommonName(username: string, mac: string): string {
  return `${username}-${mac.replace(/:/g, "")}`.slice(0, 64);
}

function escapeConfigValue(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function randomPkcs12Password(): string {
  return randomBytes(18).toString("base64url");
}

async function runOpenSsl(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("openssl", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(ServiceUnavailable("OpenSSL CLI is not available for managed certificate issuance"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(ServiceUnavailable(stderr.trim() || "OpenSSL failed to generate a client certificate"));
    });
  });
}

async function loadManagedCaMaterial(): Promise<ManagedCaMaterial> {
  const c = config();
  const certPem =
    c.DEVICE_CERT_CA_CERT_PEM ??
    (c.DEVICE_CERT_CA_CERT_PATH ? await fs.readFile(c.DEVICE_CERT_CA_CERT_PATH, "utf8") : null);
  const keyPem =
    c.DEVICE_CERT_CA_KEY_PEM ??
    (c.DEVICE_CERT_CA_KEY_PATH ? await fs.readFile(c.DEVICE_CERT_CA_KEY_PATH, "utf8") : null);

  if (!certPem || !keyPem) {
    throw ServiceUnavailable(
      "Managed certificate issuance is not configured. Provide DEVICE_CERT_CA_CERT_* and DEVICE_CERT_CA_KEY_*.",
    );
  }

  return {
    certPem,
    keyPem,
    keyPassphrase: c.DEVICE_CERT_CA_KEY_PASSPHRASE ?? null,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(join(tmpdir(), "radius-device-cert-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function issueCertificateBundle(args: {
  username: string;
  mac: string;
  commonName?: string | null;
  sanEmail?: string | null;
  pkcs12Password?: string | null;
}): Promise<{
  certificate: ClientCertificateSummary;
  certificatePem: string;
  privateKeyPem: string;
  pkcs12Base64: string;
  pkcs12Password: string;
}> {
  const c = config();
  const ca = await loadManagedCaMaterial();
  const commonName = escapeConfigValue(args.commonName?.trim() || defaultCommonName(args.username, args.mac));
  const sanEmail = args.sanEmail?.trim() || null;
  const pkcs12Password = args.pkcs12Password?.trim() || randomPkcs12Password();

  return withTempDir(async (dir) => {
    const caCertPath = join(dir, "ca.pem");
    const caKeyPath = join(dir, "ca.key");
    const reqConfigPath = join(dir, "req.cnf");
    const keyPath = join(dir, "device.key");
    const csrPath = join(dir, "device.csr");
    const certPath = join(dir, "device.pem");
    const p12Path = join(dir, "device.p12");

    const subjectLines = [
      `[ req ]`,
      `distinguished_name = dn`,
      `prompt = no`,
      `req_extensions = v3_req`,
      ``,
      `[ dn ]`,
      `CN = ${commonName}`,
      `O = ${escapeConfigValue(c.DEVICE_CERT_SUBJECT_ORGANIZATION)}`,
      `OU = ${escapeConfigValue(c.DEVICE_CERT_SUBJECT_ORGANIZATIONAL_UNIT)}`,
    ];

    if (c.DEVICE_CERT_SUBJECT_COUNTRY) {
      subjectLines.push(`C = ${escapeConfigValue(c.DEVICE_CERT_SUBJECT_COUNTRY.toUpperCase())}`);
    }
    if (c.DEVICE_CERT_SUBJECT_STATE?.trim()) {
      subjectLines.push(`ST = ${escapeConfigValue(c.DEVICE_CERT_SUBJECT_STATE)}`);
    }
    if (c.DEVICE_CERT_SUBJECT_LOCALITY?.trim()) {
      subjectLines.push(`L = ${escapeConfigValue(c.DEVICE_CERT_SUBJECT_LOCALITY)}`);
    }
    if (sanEmail) {
      subjectLines.push(`emailAddress = ${escapeConfigValue(sanEmail)}`);
    }

    subjectLines.push(
      ``,
      `[ v3_req ]`,
      `basicConstraints = critical,CA:FALSE`,
      `keyUsage = critical,digitalSignature,keyEncipherment`,
      `extendedKeyUsage = clientAuth`,
      `subjectKeyIdentifier = hash`,
    );

    if (sanEmail) {
      subjectLines.push(`subjectAltName = email:${escapeConfigValue(sanEmail)}`);
    }

    await Promise.all([
      fs.writeFile(caCertPath, ca.certPem, "utf8"),
      fs.writeFile(caKeyPath, ca.keyPem, "utf8"),
      fs.writeFile(reqConfigPath, subjectLines.join("\n"), "utf8"),
    ]);

    const env = {
      ...process.env,
      OPENSSL_CA_KEY_PASSPHRASE: ca.keyPassphrase ?? "",
    };

    await runOpenSsl(["genrsa", "-out", keyPath, "2048"], dir, env);
    await runOpenSsl(["req", "-new", "-key", keyPath, "-out", csrPath, "-config", reqConfigPath], dir, env);

    const signArgs = [
      "x509",
      "-req",
      "-in",
      csrPath,
      "-CA",
      caCertPath,
      "-CAkey",
      caKeyPath,
      "-CAcreateserial",
      "-out",
      certPath,
      "-days",
      String(c.DEVICE_CERT_VALIDITY_DAYS),
      "-sha256",
      "-extfile",
      reqConfigPath,
      "-extensions",
      "v3_req",
    ];
    if (ca.keyPassphrase) {
      signArgs.splice(8, 0, "-passin", "env:OPENSSL_CA_KEY_PASSPHRASE");
    }
    await runOpenSsl(signArgs, dir, env);

    await runOpenSsl(
      [
        "pkcs12",
        "-export",
        "-inkey",
        keyPath,
        "-in",
        certPath,
        "-certfile",
        caCertPath,
        "-out",
        p12Path,
        "-passout",
        `pass:${pkcs12Password}`,
      ],
      dir,
      env,
    );

    const [certificatePem, privateKeyPem, pkcs12] = await Promise.all([
      fs.readFile(certPath, "utf8"),
      fs.readFile(keyPath, "utf8"),
      fs.readFile(p12Path),
    ]);

    return {
      certificate: parseClientCertificatePem(certificatePem),
      certificatePem,
      privateKeyPem,
      pkcs12Base64: pkcs12.toString("base64"),
      pkcs12Password,
    };
  });
}

async function auditDisconnects(
  actorId: string,
  targetType: string,
  targetId: string,
  attempts: Awaited<ReturnType<typeof disconnectUserSessions>>,
  req?: FastifyRequest,
) {
  if (!attempts.length) return;
  await audit({
    actorId,
    action: "user_disconnect",
    targetType,
    targetId,
    metadata: {
      event: "device.certificate.disconnect",
      attempts: attempts.map((attempt) => ({
        sessionId: attempt.sessionId,
        result: { ...attempt.result },
      })),
    },
    req,
  });
}

async function loadDevice(tx: Prisma.TransactionClient, deviceId: string) {
  const device = await tx.userDevice.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      userId: true,
      mac: true,
      label: true,
      status: true,
      certFingerprint: true,
      user: {
        select: {
          username: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
  if (!device) throw NotFound("Device not found");
  return device;
}

async function persistBinding(opts: PersistBindingOptions): Promise<PersistBindingResult> {
  const binding = await prisma.$transaction(async (tx) => {
    const device = await loadDevice(tx, opts.deviceId);
    const duplicate = await tx.userDevice.findFirst({
      where: {
        certFingerprint: opts.certificate.fingerprint,
        NOT: { id: opts.deviceId },
      },
      select: { id: true, mac: true },
    });
    if (duplicate) {
      throw Conflict(`That certificate is already bound to device ${duplicate.mac}`);
    }

    const alreadyBound = device.certFingerprint === opts.certificate.fingerprint;
    if (!alreadyBound) {
      await tx.userDevice.update({
        where: { id: opts.deviceId },
        data: { certFingerprint: opts.certificate.fingerprint },
      });
    }

    await audit({
      tx,
      actorId: opts.actorId,
      action: "user_update",
      targetType: "device",
      targetId: opts.deviceId,
      metadata: {
        event: opts.source === "issued" ? "device.cert.issue" : "device.cert.bind",
        previousFingerprint: device.certFingerprint,
        fingerprint: opts.certificate.fingerprint,
        subject: opts.certificate.subject,
        issuer: opts.certificate.issuer,
        serial: opts.certificate.serial,
        notes: opts.notes ?? null,
      },
      req: opts.req,
    });

    return {
      deviceId: device.id,
      username: device.user.username,
      mac: device.mac,
      alreadyBound,
      fingerprintChanged: !alreadyBound,
    };
  });

  let approvalChanged = false;
  let disconnectAttempts: Awaited<ReturnType<typeof disconnectUserSessions>> = [];

  if (opts.approve) {
    const decision = await decideDevice({
      deviceId: opts.deviceId,
      status: "approved",
      actorId: opts.actorId,
      actorLabel: opts.actorLabel,
      source: "admin_api",
      notes: opts.notes ?? `${opts.source === "issued" ? "Issued" : "Bound"} managed device certificate`,
      req: opts.req,
    });
    approvalChanged = !decision.alreadyApplied;
    disconnectAttempts = decision.disconnectAttempts;
  }

  if (binding.fingerprintChanged && disconnectAttempts.length === 0) {
    disconnectAttempts = await disconnectUserSessions(binding.username, binding.mac);
  }

  await auditDisconnects(opts.actorId, "device", opts.deviceId, disconnectAttempts, opts.req);

  return {
    deviceId: binding.deviceId,
    username: binding.username,
    mac: binding.mac,
    alreadyBound: binding.alreadyBound,
    approvalChanged,
    disconnectedSessions: disconnectAttempts.length,
  };
}

export async function bindImportedDeviceCertificate(
  opts: MutationContext & { pem: string },
): Promise<DeviceCertificateBindingResult> {
  const certificate = parseClientCertificatePem(opts.pem);
  const result = await persistBinding({
    ...opts,
    certificate,
    source: "imported",
  });

  return {
    deviceId: result.deviceId,
    certificate,
    alreadyBound: result.alreadyBound,
    approvalChanged: result.approvalChanged,
    disconnectedSessions: result.disconnectedSessions,
  };
}

export async function generateManagedDeviceCertificate(
  opts: MutationContext & {
    commonName?: string | null;
    sanEmail?: string | null;
    pkcs12Password?: string | null;
  },
): Promise<GeneratedDeviceCertificateResult> {
  const device = await prisma.userDevice.findUnique({
    where: { id: opts.deviceId },
    select: {
      id: true,
      mac: true,
      user: {
        select: {
          username: true,
        },
      },
    },
  });
  if (!device) throw NotFound("Device not found");

  const bundle = await issueCertificateBundle({
    username: device.user.username,
    mac: device.mac,
    commonName: opts.commonName ?? null,
    sanEmail: opts.sanEmail ?? null,
    pkcs12Password: opts.pkcs12Password ?? null,
  });

  const result = await persistBinding({
    ...opts,
    certificate: bundle.certificate,
    source: "issued",
  });

  return {
    deviceId: result.deviceId,
    certificate: bundle.certificate,
    alreadyBound: result.alreadyBound,
    approvalChanged: result.approvalChanged,
    disconnectedSessions: result.disconnectedSessions,
    certificatePem: bundle.certificatePem,
    privateKeyPem: bundle.privateKeyPem,
    pkcs12Base64: bundle.pkcs12Base64,
    pkcs12Password: bundle.pkcs12Password,
  };
}

export async function clearDeviceCertificate(
  opts: MutationContext,
): Promise<DeviceCertificateMutationResult & { alreadyCleared: boolean }> {
  const cleared = await prisma.$transaction(async (tx) => {
    const device = await loadDevice(tx, opts.deviceId);
    const alreadyCleared = !device.certFingerprint;

    if (!alreadyCleared) {
      await tx.userDevice.update({
        where: { id: opts.deviceId },
        data: { certFingerprint: null },
      });
    }

    await audit({
      tx,
      actorId: opts.actorId,
      action: "user_update",
      targetType: "device",
      targetId: opts.deviceId,
      metadata: {
        event: "device.cert.clear",
        previousFingerprint: device.certFingerprint,
        notes: opts.notes ?? null,
      },
      req: opts.req,
    });

    return {
      deviceId: device.id,
      username: device.user.username,
      mac: device.mac,
      alreadyCleared,
    };
  });

  const disconnectAttempts = cleared.alreadyCleared
    ? []
    : await disconnectUserSessions(cleared.username, cleared.mac);
  await auditDisconnects(opts.actorId, "device", opts.deviceId, disconnectAttempts, opts.req);

  return {
    deviceId: cleared.deviceId,
    certificate: null,
    alreadyCleared: cleared.alreadyCleared,
    approvalChanged: false,
    disconnectedSessions: disconnectAttempts.length,
  };
}
