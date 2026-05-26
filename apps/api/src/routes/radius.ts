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
import { normalizeMac } from "../lib/mac.js";
import { sendApprovalRequest } from "../lib/telegram.js";

interface RlmAttr {
  name: string;
  value: string;
  op?: string;
}

interface RlmRestResponse {
  control?: RlmAttr[];
  reply?: RlmAttr[];
}

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

function vlanReply(vlanId: number): RlmAttr[] {
  return [
    { name: "Tunnel-Type", value: "13" },
    { name: "Tunnel-Medium-Type", value: "6" },
    { name: "Tunnel-Private-Group-ID", value: String(vlanId) },
  ];
}

function attributeKey(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeReplyAttr(attr: RlmAttr): RlmAttr {
  const key = attributeKey(attr.name);
  if (key === "tunnel-type") {
    return {
      ...attr,
      name: "Tunnel-Type",
      value: /^vlan$/i.test(attr.value) ? "13" : attr.value,
    };
  }
  if (key === "tunnel-medium-type") {
    return {
      ...attr,
      name: "Tunnel-Medium-Type",
      value: /^ieee-802$/i.test(attr.value) ? "6" : attr.value,
    };
  }
  if (key === "tunnel-private-group-id") {
    return { ...attr, name: "Tunnel-Private-Group-ID" };
  }
  return attr;
}

function replyFromGroups(groups: UserGroupReplyShape[], fallbackVlanId: number): RlmAttr[] {
  const merged = new Map<string, RlmAttr>();

  for (const membership of [...groups].sort((a, b) => a.priority - b.priority)) {
    for (const attr of membership.group.attributes) {
      if (attr.kind !== "reply") continue;
      const normalized = normalizeReplyAttr({
        name: attr.attribute,
        value: attr.value,
        op: attr.op,
      });
      const key = attributeKey(normalized.name);
      if (!merged.has(key)) merged.set(key, normalized);
    }
  }

  const attrs = [...merged.values()];
  const hasVlanId = attrs.some((attr) => attributeKey(attr.name) === "tunnel-private-group-id");
  const hasTunnelType = attrs.some((attr) => attributeKey(attr.name) === "tunnel-type");
  const hasTunnelMedium = attrs.some((attr) => attributeKey(attr.name) === "tunnel-medium-type");

  if (!hasVlanId) return [...attrs, ...vlanReply(fallbackVlanId)];

  const ensured = [...attrs];
  if (!hasTunnelType) ensured.unshift({ name: "Tunnel-Type", value: "13", op: ":=" });
  if (!hasTunnelMedium) ensured.unshift({ name: "Tunnel-Medium-Type", value: "6", op: ":=" });
  return ensured;
}

function replyForDevice(
  groups: UserGroupReplyShape[],
  status: "pending" | "approved" | "rejected" | "new",
  c: ReturnType<typeof config>,
): RlmAttr[] {
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
  const vlanId =
    replyAttrs.find((attr) => attributeKey(attr.name) === "tunnel-private-group-id")?.value ??
    String(status === "approved" ? c.NORMAL_VLAN_ID : c.QUARANTINE_VLAN_ID);

  req.log.info({ username, mac: normalizedMac, deviceStatus: status, vlanId }, "radius.authorize peap");

  const response: RlmRestResponse = {
    control: [
      { name: "NT-Password", value: `0x${ntHash}`, op: ":=" },
      { name: "Auth-Type", value: "MS-CHAP", op: ":=" },
    ],
    reply: replyAttrs,
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
  const vlanId =
    replyAttrs.find((attr) => attributeKey(attr.name) === "tunnel-private-group-id")?.value ??
    String(device.status === "approved" ? c.NORMAL_VLAN_ID : c.QUARANTINE_VLAN_ID);

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

  const response: RlmRestResponse = { reply: replyAttrs };
  return reply.status(200).send(response);
}

const radiusRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    const expected = config().RADIUS_HOOK_SECRET;
    const received = req.headers["x-radius-hook-secret"];
    if (!received || received !== expected) {
      req.log.warn({ ip: req.ip }, "radius.hook unauthorized");
      return reply.status(401).send({ error: "Unauthorized" });
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
    }

    return reply.status(200).send({ ok: true, deviceId: device.id, isNew });
  });
};

export default radiusRoutes;
