// ─────────────────────────────────────────────────────────────────────
//  Admin: LDAP / Active Directory sync.
//
//  GET  /admin/ldap/settings       — read current LDAP settings
//  PUT  /admin/ldap/settings       — write LDAP settings
//  POST /admin/ldap/test           — test bind connectivity
//  POST /admin/ldap/sync           — run a full sync
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { loadLdapSettings, runLdapSync, testLdapConnection } from "../../lib/ldap.js";
import { ServiceUnavailable } from "../../lib/errors.js";

const SettingsBody = z.object({
  url:           z.string().url().optional().or(z.literal("")),
  bindDn:        z.string().max(255).optional(),
  bindPassword:  z.string().max(255).optional(),
  userBaseDn:    z.string().max(255).optional(),
  userFilter:    z.string().max(255).optional(),
  groupBaseDn:   z.string().max(255).optional(),
  groupFilter:   z.string().max(255).optional(),
  attrUsername:  z.string().max(64).optional(),
  attrEmail:     z.string().max(64).optional(),
  attrFullname:  z.string().max(64).optional(),
  attrGroupName: z.string().max(64).optional(),
});

const KEY_MAP: Record<string, string> = {
  url:           "ldap.url",
  bindDn:        "ldap.bind_dn",
  bindPassword:  "ldap.bind_password",
  userBaseDn:    "ldap.user_base_dn",
  userFilter:    "ldap.user_filter",
  groupBaseDn:   "ldap.group_base_dn",
  groupFilter:   "ldap.group_filter",
  attrUsername:  "ldap.attr_username",
  attrEmail:     "ldap.attr_email",
  attrFullname:  "ldap.attr_fullname",
  attrGroupName: "ldap.attr_group_name",
};

const adminLdap: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/ldap/settings
  app.get("/ldap/settings", async () => {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { startsWith: "ldap." } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      url:           map["ldap.url"]             ?? "",
      bindDn:        map["ldap.bind_dn"]          ?? "",
      bindPassword:  map["ldap.bind_password"] ? "••••••••" : "",
      userBaseDn:    map["ldap.user_base_dn"]     ?? "",
      userFilter:    map["ldap.user_filter"]       ?? "(objectClass=user)",
      groupBaseDn:   map["ldap.group_base_dn"]    ?? "",
      groupFilter:   map["ldap.group_filter"]      ?? "(objectClass=group)",
      attrUsername:  map["ldap.attr_username"]     ?? "sAMAccountName",
      attrEmail:     map["ldap.attr_email"]        ?? "mail",
      attrFullname:  map["ldap.attr_fullname"]     ?? "displayName",
      attrGroupName: map["ldap.attr_group_name"]   ?? "cn",
    };
  });

  // PUT /admin/ldap/settings
  app.put("/ldap/settings", async (req, reply) => {
    const body = SettingsBody.parse(req.body);

    for (const [field, key] of Object.entries(KEY_MAP)) {
      const val = body[field as keyof typeof body];
      if (val === undefined) continue;
      // Never overwrite a masked password field with the mask placeholder
      if (field === "bindPassword" && val === "••••••••") continue;
      await prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: String(val) },
        update: { value: String(val) },
      });
    }

    return reply.status(200).send({ ok: true });
  });

  // POST /admin/ldap/test
  app.post("/ldap/test", async () => {
    const settings = await loadLdapSettings();
    if (!settings) throw ServiceUnavailable("LDAP is not configured");
    return testLdapConnection(settings);
  });

  // POST /admin/ldap/sync
  app.post("/ldap/sync", async () => {
    const settings = await loadLdapSettings();
    if (!settings) throw ServiceUnavailable("LDAP is not configured");
    return runLdapSync(settings);
  });
};

export default adminLdap;
