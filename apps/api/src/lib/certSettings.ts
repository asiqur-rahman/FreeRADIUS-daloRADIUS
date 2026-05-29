// ──────────────────────────────────────────────────────────────────────────────
//  Certificate issuance settings — DB-first, env-var fallback.
//
//  Keys in platform_settings:
//    cert.validity_days               integer days (1–397)
//    cert.subject.organization        O= field
//    cert.subject.organizational_unit OU= field
//    cert.subject.country             C= (2-letter ISO code, optional)
//    cert.subject.state               ST= (optional)
//    cert.subject.locality            L=  (optional)
//
//  When a DB key is absent, the corresponding env var is used as fallback.
//  This lets operators configure cert defaults through the admin UI without
//  touching environment files.
// ──────────────────────────────────────────────────────────────────────────────

import { prisma } from "../db.js";
import { config } from "../config.js";

export const CERT_SETTING_KEYS = [
  "cert.validity_days",
  "cert.subject.organization",
  "cert.subject.organizational_unit",
  "cert.subject.country",
  "cert.subject.state",
  "cert.subject.locality",
] as const;

export interface CertSubjectSettings {
  validityDays:       number;
  organization:       string;
  organizationalUnit: string;
  country:            string | null;
  state:              string | null;
  locality:           string | null;
}

export async function getCertSettings(): Promise<CertSubjectSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [...CERT_SETTING_KEYS] } },
  });
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;

  const c = config();

  const rawDays = m["cert.validity_days"] ? parseInt(m["cert.validity_days"], 10) : NaN;
  const validityDays = Number.isFinite(rawDays) && rawDays >= 1
    ? Math.min(397, rawDays)
    : c.DEVICE_CERT_VALIDITY_DAYS;

  return {
    validityDays,
    organization:
      m["cert.subject.organization"]?.trim()             || c.DEVICE_CERT_SUBJECT_ORGANIZATION,
    organizationalUnit:
      m["cert.subject.organizational_unit"]?.trim()      || c.DEVICE_CERT_SUBJECT_ORGANIZATIONAL_UNIT,
    country:
      (m["cert.subject.country"]?.trim().toUpperCase()   || c.DEVICE_CERT_SUBJECT_COUNTRY?.toUpperCase() || null)?.slice(0, 2) || null,
    state:
      m["cert.subject.state"]?.trim()                    || c.DEVICE_CERT_SUBJECT_STATE    || null,
    locality:
      m["cert.subject.locality"]?.trim()                 || c.DEVICE_CERT_SUBJECT_LOCALITY || null,
  };
}

export async function saveCertSettings(settings: Partial<CertSubjectSettings>): Promise<void> {
  const pairs: Array<[string, string]> = [];

  if (settings.validityDays !== undefined) {
    const days = Math.min(397, Math.max(1, Math.round(settings.validityDays)));
    pairs.push(["cert.validity_days", String(days)]);
  }
  if (settings.organization !== undefined)
    pairs.push(["cert.subject.organization", settings.organization.trim()]);
  if (settings.organizationalUnit !== undefined)
    pairs.push(["cert.subject.organizational_unit", settings.organizationalUnit.trim()]);
  if (settings.country !== undefined)
    pairs.push(["cert.subject.country", (settings.country ?? "").trim().toUpperCase().slice(0, 2)]);
  if (settings.state !== undefined)
    pairs.push(["cert.subject.state", (settings.state ?? "").trim()]);
  if (settings.locality !== undefined)
    pairs.push(["cert.subject.locality", (settings.locality ?? "").trim()]);

  await Promise.all(
    pairs.map(([key, value]) =>
      prisma.platformSetting.upsert({
        where:  { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );
}
