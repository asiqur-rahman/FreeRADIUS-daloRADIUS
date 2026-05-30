// ──────────────────────────────────────────────────────────────────────
//  SAML 2.0 Service Provider service.
//
//  Settings stored in platform_settings (prefix "saml."):
//    saml.enabled            "true" / "false"
//    saml.entry_point        IdP SSO URL
//    saml.issuer             SP entity ID (default: <app base URL>/saml)
//    saml.cert               IdP X.509 cert (PEM, no headers)
//    saml.sp_cert            SP cert PEM (optional, for signed requests)
//    saml.sp_key             SP private key PEM (optional)
//    saml.name_id_format     default: urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
//    saml.attr_username      attribute → username (default: http://schemas…/name)
//    saml.attr_email         attribute → email    (default: NameID)
//    saml.attr_fullname      attribute → fullname (default: http://schemas…/displayname)
// ──────────────────────────────────────────────────────────────────────

import { SAML } from "@node-saml/node-saml";
import type { Profile } from "@node-saml/node-saml";
import { prisma } from "../db.js";

export interface SamlSettings {
  enabled: boolean;
  entryPoint: string;
  issuer: string;
  cert: string;
  spCert: string;
  spKey: string;
  nameIdFormat: string;
  attrUsername: string;
  attrEmail: string;
  attrFullname: string;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function loadSamlSettings(): Promise<SamlSettings | null> {
  const enabled = await getSetting("saml.enabled");
  if (enabled !== "true") return null;
  const entryPoint = await getSetting("saml.entry_point");
  if (!entryPoint?.trim()) return null;
  const cert = await getSetting("saml.cert");
  if (!cert?.trim()) return null;

  return {
    enabled: true,
    entryPoint,
    issuer:       (await getSetting("saml.issuer"))          ?? "https://radius.local/saml",
    cert,
    spCert:       (await getSetting("saml.sp_cert"))         ?? "",
    spKey:        (await getSetting("saml.sp_key"))          ?? "",
    nameIdFormat: (await getSetting("saml.name_id_format"))  ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    attrUsername: (await getSetting("saml.attr_username"))   ?? "",
    attrEmail:    (await getSetting("saml.attr_email"))      ?? "",
    attrFullname: (await getSetting("saml.attr_fullname"))   ?? "",
  };
}

export function buildSamlInstance(settings: SamlSettings, callbackUrl: string): SAML {
  return new SAML({
    entryPoint:              settings.entryPoint,
    issuer:                  settings.issuer,
    idpCert:                 settings.cert,
    callbackUrl,
    privateKey:              settings.spKey  || undefined,
    decryptionPvk:           settings.spKey  || undefined,
    wantAuthnResponseSigned: true,
    acceptedClockSkewMs:     -1,
  });
}

export function extractProfile(profile: Profile, settings: SamlSettings): {
  username: string;
  email: string;
  fullName: string | null;
} {
  const nameId = profile.nameID ?? "";

  const get = (attr: string) => {
    if (!attr) return "";
    const val = (profile as Record<string, unknown>)[attr];
    if (Array.isArray(val)) return String(val[0] ?? "");
    return String(val ?? "");
  };

  const email    = (settings.attrEmail    ? get(settings.attrEmail)    : "") || nameId;
  const username = (settings.attrUsername ? get(settings.attrUsername)  : "") || email.split("@")[0] || nameId;
  const fullName = settings.attrFullname  ? get(settings.attrFullname)  : null;

  return {
    username: username.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 64),
    email:    email.toLowerCase(),
    fullName: fullName || null,
  };
}
