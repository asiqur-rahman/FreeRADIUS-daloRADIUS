// ──────────────────────────────────────────────────────────────────────
//  LDAP / Active Directory sync service.
//
//  Reads settings from platform_settings (key prefix "ldap.").
//  Imports users and group memberships from the directory into the
//  application DB.  Skips users who already exist (match by username).
//  Creates missing groups on demand.
//
//  Settings keys (all optional — sync is no-op when ldap.url is absent):
//    ldap.url          e.g. ldap://192.168.1.10:389  (or ldaps://…)
//    ldap.bind_dn      e.g. CN=svcaccount,DC=corp,DC=local
//    ldap.bind_password
//    ldap.user_base_dn e.g. OU=Users,DC=corp,DC=local
//    ldap.user_filter  e.g. (objectClass=user)
//    ldap.group_base_dn
//    ldap.group_filter e.g. (objectClass=group)
//    ldap.attr_username  default: sAMAccountName
//    ldap.attr_email     default: mail
//    ldap.attr_fullname  default: displayName
//    ldap.attr_group_name default: cn
// ──────────────────────────────────────────────────────────────────────

import { Client } from "ldapts";
import { prisma } from "../db.js";
import { hashPassword, ntHash } from "./password.js";
import { randomBytes } from "node:crypto";

export interface LdapSettings {
  url: string;
  bindDn: string;
  bindPassword: string;
  userBaseDn: string;
  userFilter: string;
  groupBaseDn: string;
  groupFilter: string;
  attrUsername: string;
  attrEmail: string;
  attrFullname: string;
  attrGroupName: string;
}

export interface LdapSyncResult {
  usersFound: number;
  usersCreated: number;
  usersSkipped: number;
  groupsCreated: number;
  membershipsAdded: number;
  errors: string[];
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function loadLdapSettings(): Promise<LdapSettings | null> {
  const url = await getSetting("ldap.url");
  if (!url?.trim()) return null;

  return {
    url,
    bindDn:        (await getSetting("ldap.bind_dn"))         ?? "",
    bindPassword:  (await getSetting("ldap.bind_password"))    ?? "",
    userBaseDn:    (await getSetting("ldap.user_base_dn"))     ?? "",
    userFilter:    (await getSetting("ldap.user_filter"))      ?? "(objectClass=user)",
    groupBaseDn:   (await getSetting("ldap.group_base_dn"))    ?? "",
    groupFilter:   (await getSetting("ldap.group_filter"))     ?? "(objectClass=group)",
    attrUsername:  (await getSetting("ldap.attr_username"))    ?? "sAMAccountName",
    attrEmail:     (await getSetting("ldap.attr_email"))       ?? "mail",
    attrFullname:  (await getSetting("ldap.attr_fullname"))    ?? "displayName",
    attrGroupName: (await getSetting("ldap.attr_group_name"))  ?? "cn",
  };
}

export async function testLdapConnection(settings: LdapSettings): Promise<{ ok: boolean; error?: string }> {
  const client = new Client({ url: settings.url, connectTimeout: 5000 });
  try {
    await client.bind(settings.bindDn, settings.bindPassword);
    await client.unbind();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function strAttr(entry: Record<string, unknown>, key: string): string {
  const val = entry[key];
  if (Array.isArray(val)) return String(val[0] ?? "");
  if (typeof val === "string") return val;
  if (val instanceof Buffer) return val.toString("utf8");
  return String(val ?? "");
}

export async function runLdapSync(settings: LdapSettings): Promise<LdapSyncResult> {
  const result: LdapSyncResult = {
    usersFound: 0,
    usersCreated: 0,
    usersSkipped: 0,
    groupsCreated: 0,
    membershipsAdded: 0,
    errors: [],
  };

  const client = new Client({ url: settings.url, connectTimeout: 8000 });

  try {
    await client.bind(settings.bindDn, settings.bindPassword);

    // ── 1. Fetch users ──────────────────────────────────────────────
    if (!settings.userBaseDn) {
      result.errors.push("ldap.user_base_dn is not configured");
      return result;
    }

    const { searchEntries: userEntries } = await client.search(settings.userBaseDn, {
      scope: "sub",
      filter: settings.userFilter,
      attributes: [settings.attrUsername, settings.attrEmail, settings.attrFullname, "dn", "memberOf"],
    });

    result.usersFound = userEntries.length;

    // ── 2. Fetch groups ─────────────────────────────────────────────
    const groupDnToName = new Map<string, string>();
    if (settings.groupBaseDn) {
      const { searchEntries: groupEntries } = await client.search(settings.groupBaseDn, {
        scope: "sub",
        filter: settings.groupFilter,
        attributes: [settings.attrGroupName, "dn"],
      });
      for (const g of groupEntries) {
        const dn   = String(g.dn);
        const name = strAttr(g as Record<string, unknown>, settings.attrGroupName);
        if (name) groupDnToName.set(dn.toLowerCase(), name);
      }
    }

    // ── 3. Upsert users and memberships ─────────────────────────────
    for (const entry of userEntries) {
      const e       = entry as Record<string, unknown>;
      const rawUser = strAttr(e, settings.attrUsername).toLowerCase().trim();
      const email   = strAttr(e, settings.attrEmail).toLowerCase().trim();
      const full    = strAttr(e, settings.attrFullname).trim();

      if (!rawUser || !email || !email.includes("@")) {
        result.usersSkipped++;
        continue;
      }

      // Check for existing user
      const existing = await prisma.user.findFirst({
        where: { OR: [{ username: rawUser }, { email }] },
      });

      let userId: string;

      if (existing) {
        userId = existing.id;
        result.usersSkipped++;
      } else {
        // Create user with a random initial password (admin must reset or use EAP-TLS)
        const tempPwd = randomBytes(16).toString("base64url");
        const [argon2id, nt] = await Promise.all([hashPassword(tempPwd), Promise.resolve(ntHash(tempPwd))]);
        const newUser = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: { username: rawUser, email, fullName: full || null, status: "active" },
          });
          await tx.userSecret.create({
            data: {
              userId: u.id,
              passwordHashArgon2id: argon2id,
              ntHash: nt,
              mustChangePassword: true,
            },
          });
          return u;
        });
        userId = newUser.id;
        result.usersCreated++;
      }

      // ── Group memberships ──────────────────────────────────────────
      const memberOf = e["memberOf"];
      const memberDns: string[] = Array.isArray(memberOf)
        ? memberOf.map(String)
        : typeof memberOf === "string"
          ? [memberOf]
          : [];

      for (const dn of memberDns) {
        const groupName = groupDnToName.get(dn.toLowerCase());
        if (!groupName) continue;

        const existingGroup = await prisma.group.findUnique({ where: { name: groupName } });
        const group = await prisma.group.upsert({
          where: { name: groupName },
          create: { name: groupName, description: `Imported from LDAP (${groupName})` },
          update: {},
        });
        if (!existingGroup) result.groupsCreated++;

        const alreadyMember = await prisma.userGroup.findUnique({
          where: { userId_groupId: { userId, groupId: group.id } },
        });
        if (!alreadyMember) {
          await prisma.userGroup.create({ data: { userId, groupId: group.id } });
          result.membershipsAdded++;
        }
      }
    }

    await client.unbind();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}
