// ---------------------------------------------------------------------------
// FreeRADIUS rlm_rest hook endpoints.
//
// These routes are called by FreeRADIUS, not by browser users.
// They are protected by X-Radius-Hook-Secret.
//
// POST /api/v1/radius/authorize
//   PEAP inner-tunnel: returns NT-Password + reply policy.
//   EAP-TLS check-eap-tls: returns reply policy for a bound client cert.
//
// POST /api/v1/radius/post-auth
//   Called after successful PEAP/MSCHAPv2 auth.
//   Learns new MAC devices and triggers the approval workflow.
// ---------------------------------------------------------------------------

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  summarizePresentedCertificate,
  type ClientCertificateSummary,
} from "../lib/clientCertificates.js";
import { emitPlatformEvent } from "../lib/events.js";
import { isIpAllowed } from "../lib/ipGuard.js";
import { normalizeMac } from "../lib/mac.js";
import { sendApprovalRequest } from "../lib/telegram.js";

// rlm_rest 3.2.x expects a FLAT dict response — nested arrays / objects are
// silently skipped with "Found nested VP, these are not yet supported".
// Keys are prefixed with "control:" or "reply:" to indicate the attribute list.
// Values are plain strings; the operator defaults to := (set/override).
type FlatRlmResponse = Record<string, string>;

interface UserGroupReplyShape {
  priority: number;
  group: {
    attributes: Array<{
      attribute: string;
      op: string;
      value: string;
      kind: string;
    }>;
  };
}

interface AuthorizeBody {
  authMethod?: "peap" | "eap-tls";
  username?: string;
  mac: string;
  nasIp: string;
  nasIdentifier?: string;
  calledStationId?: string;
  certSubject?: string;
  certIssuer?: string;
  certSerial?: string;
  certCommonName?: string;
  certEmail?: string;
}

function vlanReply(vlanId: number): FlatRlmResponse {
  return {
    "reply:Tunnel-Type":              "13",
    "reply:Tunnel-Medium-Type":       "6",
    "reply:Tunnel-Private-Group-ID":  String(vlanId),
  };
}

function attributeKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Normalize a group attribute name/value to the canonical VLAN triple. */
function normalizeGroupAttr(name: string, value: string): [replyKey: string, val: string] {
  const key = attributeKey(name);
  if (key === "tunnel-type")
    return ["reply:Tunnel-Type", /^vlan$/i.test(value) ? "13" : value];
  if (key === "tunnel-medium-type")
    return ["reply:Tunnel-Medium-Type", /^ieee-802$/i.test(value) ? "6" : value];
  if (key === "tunnel-private-group-id")
    return ["reply:Tunnel-Private-Group-ID", value];
  // Other reply attributes — pass through with reply: prefix.
  return [`reply:${name}`, value];
}

function replyFromGroups(groups: UserGroupReplyShape[], fallbackVlanId: number): FlatRlmResponse {
  const merged = new Map<string, string>();

  for (const membership of [...groups].sort((a, b) => a.priority - b.priority)) {
    for (const attr of membership.group.attributes) {
      if (attr.kind !== "reply") continue;
      const [flatKey, val] = normalizeGroupAttr(attr.attribute, attr.value);
      if (!merged.has(flatKey)) merged.set(flatKey, val);
    }
  }

  const out: FlatRlmResponse = Object.fromEntries(merged);

  // Ensure the VLAN triple is present.
  if (!merged.has("reply:Tunnel-Private-Group-ID")) {
    Object.assign(out, vlanReply(fallbackVlanId));
  } else {
    if (!merged.has("reply:Tunnel-Type"))        out["reply:Tunnel-Type"]        = "13";
    if (!merged.has("reply:Tunnel-Medium-Type")) out["reply:Tunnel-Medium-Type"] = "6";
  }
  return out;
}

function replyForDevice(
  groups: UserGroupReplyShape[],
  status: "pending" | "approved" | "rejected" | "new",
  c: ReturnType<typeof config>,
): FlatRlmResponse {
  return status === "approved"
    ? replyFromGroups(groups, c.NORMAL_VLAN_ID)
    : vlanReply(c.QUARANTINE_VLAN_ID);
}

async function createPendingApproval(deviceId: string, request: {
  username: string;
  fullName: string | null;
  mac: string;
  nasIp: string;
}) {
  await prisma.deviceApproval.create({
    data: { deviceId, status: "pending" },
  });

  await sendApprovalRequest({
    deviceId,
    username: request.username,
    fullName: request.fullName,
    mac: request.mac,
    nasIp: request.nasIp,
  });
}

async function authorizePeap(
  req: FastifyRequest<{ Body: AuthorizeBody }>,
  reply: FastifyReply,
  body: AuthorizeBody,
) {
  const c = config();
  const username = body.username?.toLowerCase();
  if (!username) {
    return reply.status(400).send({ error: "Username is required for PEAP" });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      secret: true,
      groups: {
        include: {
          group: {
            include: { attributes: true },
          },
        },
        orderBy: { priority: "asc" },
      },
    },
  });

  if (!user || user.status !== "active" || !user.secret) {
    req.log.info({ username }, "radius.authorize user not found or inactive");
    return reply.status(404).send({ error: "User not found" });
  }

  const ntHash = user.secret.ntHash;
  if (!ntHash || ntHash.length !== 32) {
    req.log.warn({ username }, "radius.authorize missing ntHash");
    return reply.status(500).send({ error: "No NT-Password configured" });
  }

  const normalizedMac = normalizeMac(body.mac);
  const device = await prisma.userDevice.findFirst({
    where: { userId: user.id, mac: normalizedMac },
    select: { status: true },
  });

  if (device?.status === "rejected") {
    req.log.info({ username, mac: normalizedMac }, "radius.authorize device rejected");
    return reply.status(403).send({ error: "Device rejected" });
  }

  const status = device?.status ?? "new";
  const replyAttrs = replyForDevice(user.groups, status, c);
  const vlanId = replyAttrs["reply:Tunnel-Private-Group-ID"]
    ?? String(status === "approved" ? c.NORMAL_VLAN_ID : c.QUARANTINE_VLAN_ID);

  req.log.info({ username, mac: normalizedMac, deviceStatus: status, vlanId }, "radius.authorize peap");

  // Flat rlm_rest 3.2.x response — "control:X" keys → control list,
  // "reply:X" keys → reply list.  Plain string values, operator defaults to :=
  //
  // NOTE: Do NOT set control:Auth-Type here.  Inside the PEAP inner tunnel,
  // EAP-MSCHAPv2 is wrapped in EAP-Message and handled by the `eap` module
  // (which delegates to its eap_mschapv2 sub-module).  Setting Auth-Type :=
  // MS-CHAP causes FreeRADIUS to invoke the raw mschap module directly, which
  // then errors "No MS-CHAP attributes in request" because the challenge/
  // response are EAP-wrapped, not bare MS-CHAP-Challenge / MS-CHAP2-Response.
  const response: FlatRlmResponse = {
    "control:NT-Password": `0x${ntHash}`,
    ...replyAttrs,
  };

  return reply.status(200).send(response);
}

async function authorizeEapTls(
  req: FastifyRequest<{ Body: AuthorizeBody }>,
  reply: FastifyReply,
  body: AuthorizeBody,
) {
  const c = config();
  const normalizedMac = normalizeMac(body.mac);
  let certificate: ClientCertificateSummary;

  try {
    certificate = summarizePresentedCertificate({
      subject: body.certSubject ?? null,
      issuer: body.certIssuer ?? null,
      serial: body.certSerial ?? null,
      commonName: body.certCommonName ?? null,
      sanEmail: body.certEmail ?? null,
    });
  } catch (error) {
    req.log.warn(
      {
        mac: normalizedMac,
        certSubject: body.certSubject,
        certIssuer: body.certIssuer,
        certSerial: body.certSerial,
      },
      "radius.authorize eap-tls missing certificate identity",
    );
    throw error;
  }

  const device = await prisma.userDevice.findFirst({
    where: { certFingerprint: certificate.fingerprint },
    include: {
      user: {
        include: {
          groups: {
            include: {
              group: {
                include: { attributes: true },
              },
            },
            orderBy: { priority: "asc" },
          },
        },
      },
      approvals: {
        where: { status: "pending" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!device || device.user.status !== "active") {
    req.log.info(
      {
        mac: normalizedMac,
        fingerprint: certificate.fingerprint,
        commonName: certificate.commonName,
      },
      "radius.authorize eap-tls certificate not registered",
    );
    return reply.status(403).send({ error: "Certificate not registered" });
  }

  if (device.mac !== normalizedMac) {
    req.log.info(
      {
        username: device.user.username,
        expectedMac: device.mac,
        presentedMac: normalizedMac,
        fingerprint: certificate.fingerprint,
      },
      "radius.authorize eap-tls mac mismatch",
    );
    return reply.status(403).send({ error: "Certificate presented from an unexpected device" });
  }

  if (device.status === "rejected") {
    req.log.info(
      {
        username: device.user.username,
        mac: normalizedMac,
        fingerprint: certificate.fingerprint,
      },
      "radius.authorize eap-tls device rejected",
    );
    return reply.status(403).send({ error: "Device rejected" });
  }

  await prisma.userDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  if (device.status === "pending" && device.approvals.length === 0) {
    req.log.info(
      {
        username: device.user.username,
        mac: normalizedMac,
        deviceId: device.id,
      },
      "radius.eap_tls.pending_device",
    );
    createPendingApproval(device.id, {
      username: device.user.username,
      fullName: device.user.fullName,
      mac: normalizedMac,
      nasIp: body.nasIp,
    }).catch((err) => {
      req.log.error({ err, deviceId: device.id }, "radius.eap_tls.pending_notify failed");
    });
  }

  const replyAttrs = replyForDevice(device.user.groups, device.status, c);
  const vlanId = replyAttrs["reply:Tunnel-Private-Group-ID"]
    ?? String(device.status === "approved" ? c.NORMAL_VLAN_ID : c.QUARANTINE_VLAN_ID);

  req.log.info(
    {
      username: device.user.username,
      mac: normalizedMac,
      deviceStatus: device.status,
      authMethod: "eap-tls",
      certCommonName: certificate.commonName,
      certFingerprint: certificate.fingerprint,
      vlanId,
    },
    "radius.authorize eap-tls",
  );

  // EAP-TLS: no password check needed — cert already validated by FreeRADIUS.
  // Only VLAN reply attrs are needed.
  const response: FlatRlmResponse = { ...replyAttrs };
  return reply.status(200).send(response);
}

const radiusRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    const c = config();

    // 1. Shared-secret check (always).
    //
    // FreeRADIUS rlm_rest 3.2.x ignores header{} config blocks, so the secret
    // cannot be delivered as an HTTP header from FreeRADIUS.  Instead it is
    // appended as ?s=<secret> on the URI (double-quoted string, $ENV{} expanded
    // at FreeRADIUS config-load time).
    //
    // We accept it from three sources so callers remain flexible:
    //   • X-Radius-Hook-Secret header  — curl / SDK / future FreeRADIUS
    //   • ?s=<secret> query parameter  — current FreeRADIUS rlm_rest workaround
    //   • hookSecret body field        — fallback (also works)
    const expected  = c.RADIUS_HOOK_SECRET;
    const fromHeader = req.headers["x-radius-hook-secret"];
    const fromQuery  = (req.query as Record<string, unknown>)?.s;
    const fromBody   = (req.body  as Record<string, unknown> | null)?.hookSecret;
    const received   =
      fromHeader ??
      (typeof fromQuery === "string" ? fromQuery : undefined) ??
      (typeof fromBody  === "string" ? fromBody  : undefined);

    if (!received || received !== expected) {
      req.log.warn({ ip: req.ip }, "radius.hook unauthorized — bad secret");
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // 2. IP allowlist check (only when enabled)
    if (c.RADIUS_IP_GUARD_ENABLED) {
      const allowed = await isIpAllowed(req.ip);
      if (!allowed) {
        req.log.warn({ ip: req.ip }, "radius.hook unauthorized — IP not in allowlist");
        return reply.status(403).send({ error: "Forbidden" });
      }
    }
  });

  app.post<{ Body: AuthorizeBody }>("/authorize", async (req, reply) => {
    const authMethod = req.body.authMethod === "eap-tls" ? "eap-tls" : "peap";
    if (authMethod === "eap-tls") {
      return authorizeEapTls(req, reply, req.body);
    }
    return authorizePeap(req, reply, req.body);
  });

  app.post<{
    Body: {
      username: string;
      mac: string;
      nasIp: string;
      vlan?: string;
    };
  }>("/post-auth", async (req, reply) => {
    const { username, mac, nasIp } = req.body;
    const normalizedMac = normalizeMac(mac);

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, fullName: true },
    });
    if (!user) return reply.status(200).send({ ok: false });

    const existing = await prisma.userDevice.findFirst({
      where: { userId: user.id, mac: normalizedMac },
    });
    const isNew = !existing;

    const device = await prisma.userDevice.upsert({
      where: { userId_mac: { userId: user.id, mac: normalizedMac } },
      create: {
        userId: user.id,
        mac: normalizedMac,
        lastSeenAt: new Date(),
        status: "pending",
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    if (isNew) {
      req.log.info({ username, mac: normalizedMac, deviceId: device.id }, "radius.new_device");
      createPendingApproval(device.id, {
        username: user.username,
        fullName: user.fullName,
        mac: normalizedMac,
        nasIp,
      }).catch((err) => {
        req.log.error({ err, deviceId: device.id }, "telegram.send_approval_request failed");
      });

      // Notify SSE subscribers so the admin dashboard reloads immediately
      emitPlatformEvent("device.pending", {
        deviceId: device.id,
        username: user.username,
        fullName: user.fullName,
        mac: normalizedMac,
        nasIp,
        isNew: true,
      });
    }

    return reply.status(200).send({ ok: true, deviceId: device.id, isNew });
  });
};

export default radiusRoutes;
