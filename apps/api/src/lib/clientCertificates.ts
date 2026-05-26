import { X509Certificate, createHash } from "node:crypto";
import { BadRequest } from "./errors.js";

export interface ClientCertificateSummary {
  fingerprint: string;
  subject: string;
  issuer: string | null;
  serial: string | null;
  commonName: string | null;
  sanEmail: string | null;
  validFrom: string | null;
  validTo: string | null;
}

interface DistinguishedNamePart {
  key: string;
  value: string;
}

function splitSlashDn(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of value.slice(1)) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "/") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitCommaOrLineDn(value: string): string[] {
  return value
    .split(/\n|,(?=\s*[A-Za-z][A-Za-z0-9.-]*=)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDistinguishedName(raw: string | null | undefined): DistinguishedNamePart[] {
  const value = raw?.trim();
  if (!value) return [];

  const segments = value.startsWith("/") ? splitSlashDn(value) : splitCommaOrLineDn(value);

  return segments
    .map((segment) => {
      const idx = segment.indexOf("=");
      if (idx < 1) return null;
      return {
        key: segment.slice(0, idx).trim(),
        value: segment.slice(idx + 1).trim(),
      };
    })
    .filter((segment): segment is DistinguishedNamePart => Boolean(segment));
}

function normalizeDnValue(value: string): string {
  return value
    .replace(/\\([\\,/+=<>#;"])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeDistinguishedName(raw: string | null | undefined): string {
  return parseDistinguishedName(raw)
    .map((part) => `${part.key.toLowerCase()}=${normalizeDnValue(part.value)}`)
    .join(",");
}

function normalizeSerial(serial: string | null | undefined): string {
  return (serial ?? "").replace(/[^0-9a-f]/gi, "").toLowerCase();
}

function firstDnValue(raw: string | null | undefined, key: string): string | null {
  const match = parseDistinguishedName(raw).find((part) => part.key.toLowerCase() === key.toLowerCase());
  return match?.value ?? null;
}

function firstSubjectAltNameEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/(?:^|,\s*)email:([^,]+)/i);
  return match?.[1]?.trim() ?? null;
}

export function deriveClientCertificateFingerprint(fields: {
  subject: string | null | undefined;
  issuer: string | null | undefined;
  serial: string | null | undefined;
}): string {
  const subject = normalizeDistinguishedName(fields.subject);
  const issuer = normalizeDistinguishedName(fields.issuer);
  const serial = normalizeSerial(fields.serial);

  if (!subject || !issuer || !serial) {
    throw BadRequest("Client certificate identity is incomplete");
  }

  // FreeRADIUS exposes subject / issuer / serial in check-eap-tls, not the
  // raw certificate bytes, so managed-device binding stores a stable digest
  // derived from those attributes rather than a literal DER fingerprint.
  return createHash("sha256")
    .update(`subject=${subject}\nissuer=${issuer}\nserial=${serial}`)
    .digest("hex");
}

export function summarizePresentedCertificate(fields: {
  subject: string | null | undefined;
  issuer: string | null | undefined;
  serial: string | null | undefined;
  commonName?: string | null | undefined;
  sanEmail?: string | null | undefined;
  validFrom?: string | null | undefined;
  validTo?: string | null | undefined;
}): ClientCertificateSummary {
  const subject = fields.subject?.trim();
  if (!subject) throw BadRequest("Client certificate subject is missing");

  return {
    fingerprint: deriveClientCertificateFingerprint(fields),
    subject,
    issuer: fields.issuer?.trim() || null,
    serial: fields.serial?.trim() || null,
    commonName: fields.commonName?.trim() || firstDnValue(subject, "CN"),
    sanEmail: fields.sanEmail?.trim() || null,
    validFrom: fields.validFrom?.trim() || null,
    validTo: fields.validTo?.trim() || null,
  };
}

export function parseClientCertificatePem(pem: string): ClientCertificateSummary {
  let parsed: X509Certificate;
  try {
    parsed = new X509Certificate(pem);
  } catch (cause) {
    throw BadRequest("Could not parse PEM as an X.509 certificate", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  return summarizePresentedCertificate({
    subject: parsed.subject,
    issuer: parsed.issuer,
    serial: parsed.serialNumber,
    commonName: firstDnValue(parsed.subject, "CN"),
    sanEmail: firstSubjectAltNameEmail(parsed.subjectAltName),
    validFrom: new Date(parsed.validFrom).toISOString(),
    validTo: new Date(parsed.validTo).toISOString(),
  });
}
