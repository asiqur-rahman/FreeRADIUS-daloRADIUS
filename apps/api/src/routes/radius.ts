// ─────────────────────────────────────────────────────────────────────
//  FreeRADIUS rlm_rest hook endpoints.
//
//  These routes are called by FreeRADIUS (not by users or the web UI).
//  They are protected by a shared secret in X-Radius-Hook-Secret.
//
//  POST /api/v1/radius/authorize
//    Called from inner-tunnel authorize.
//    Returns NT-Password + VLAN assignment.
//
//  POST /api/v1/radius/post-auth
//    Called after successful MSCHAPv2 authentication.
//    Registers new devices, fires Telegram notification.
// ─────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { sendApprovalRequest } from "../lib/telegram.js";

// ── RADIUS attribute value helpers ────────────────────────────────
// FreeRADIUS rlm_rest expects reply/control attributes in this shape.

interface RlmAttr {
  name:  string;
  value: string;
  op?:   string; // default ":=" for control, "=" for reply
}

interface RlmRestResponse {
  control?: RlmAttr[];
  reply?:   RlmAttr[];
}

function vlanReply(vlanId: number): RlmAttr[] {
  return [
    { name: "Tunnel-Type",             value: "13" }, // VLAN
    { name: "Tunnel-Medium-Type",      value: "6"  }, // IEEE-802
    { name: "Tunnel-Private-Group-ID", value: String(vlanId) },
  ];
}

// ── Route plugin ──────────────────────────────────────────────────

const radiusRoutes: FastifyPluginAsync = async (app) => {
  // ── Shared-secret guard ─────────────────────────────────────────
  app.addHook("preHandler", async (req, reply) => {
    const expected = config().RADIUS_HOOK_SECRET;
    const received = req.headers["x-radius-hook-secret"];
    if (!received || received !== expected) {
      req.log.warn({ ip: req.ip }, "radius.hook unauthorized — bad or missing secret");
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  // ── POST /authorize ─────────────────────────────────────────────
  app.post<{
    Body: {
      username:        string;
      mac:             string;
      nasIp:           string;
      nasIdentifier?:  string;
      calledStationId?: string;
    };
  }>("/authorize", async (req, reply) => {
    const { username, mac, nasIp } = req.body;
    const c = config();

    // 1. Load user + credentials.
    const user = await prisma.user.findUnique({
      where:   { username },
      include: { secret: true },
    });

    if (!user || user.status !== "active" || !user.secret) {
      req.log.info({ username }, "radius.authorize user not found or inactive");
      return reply.status(404).send({ error: "User not found" });
    }

    // NT-Password must be 32 hex chars (16-byte MD4 hash).
    const ntHash = user.secret.ntHash;
    if (!ntHash || ntHash.length !== 32) {
      req.log.warn({ username }, "radius.authorize missing ntHash");
      return reply.status(500).send({ error: "No NT-Password configured" });
    }

    // 2. Normalize MAC (lowercase, colon-separated).
    const normalizedMac = normalizeMac(mac);

    // 3. Look up device status.
    const device = await prisma.userDevice.findFirst({
      where: { userId: user.id, mac: normalizedMac },
    });

    if (device?.status === "rejected") {
      req.log.info({ username, mac: normalizedMac }, "radius.authorize device rejected");
      return reply.status(403).send({ error: "Device rejected" });
    }

    // 4. Choose VLAN: approved device → normal, otherwise quarantine.
    const vlanId = device?.status === "approved" ? c.NORMAL_VLAN_ID : c.QUARANTINE_VLAN_ID;

    req.log.info(
      { username, mac: normalizedMac, deviceStatus: device?.status ?? "new", vlanId },
      "radius.authorize ok",
    );

    const response: RlmRestResponse = {
      control: [
        // NT-Password value: FreeRADIUS expects 0x-prefixed hex for octets.
        { name: "NT-Password", value: `0x${ntHash}`, op: ":=" },
        { name: "Auth-Type",   value: "MS-CHAP",     op: ":=" },
      ],
      reply: vlanReply(vlanId),
    };

    return reply.status(200).send(response);
  });

  // ── POST /post-auth ─────────────────────────────────────────────
  app.post<{
    Body: {
      username: string;
      mac:      string;
      nasIp:    string;
      vlan?:    string;
    };
  }>("/post-auth", async (req, reply) => {
    const { username, mac, nasIp } = req.body;

    const normalizedMac = normalizeMac(mac);

    const user = await prisma.user.findUnique({
      where:  { username },
      select: { id: true, username: true, fullName: true },
    });
    if (!user) {
      // Shouldn't happen (authorize already checked), but handle gracefully.
      return reply.status(200).send({ ok: false });
    }

    // Upsert device — create if first time, update lastSeenAt every time.
    const existing = await prisma.userDevice.findFirst({
      where: { userId: user.id, mac: normalizedMac },
    });

    const isNew = !existing;

    const device = await prisma.userDevice.upsert({
      where:  { userId_mac: { userId: user.id, mac: normalizedMac } },
      create: {
        userId:     user.id,
        mac:        normalizedMac,
        lastSeenAt: new Date(),
        status:     "pending",
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    // For brand-new devices, create the approval record and notify admin.
    if (isNew) {
      await prisma.deviceApproval.create({
        data: { deviceId: device.id, status: "pending" },
      });

      req.log.info({ username, mac: normalizedMac, deviceId: device.id }, "radius.new_device");

      // Fire-and-forget Telegram notification.
      sendApprovalRequest({
        deviceId: device.id,
        username: user.username,
        fullName: user.fullName,
        mac:      normalizedMac,
        nasIp,
      }).catch((err) => {
        req.log.error({ err }, "telegram.send_approval_request failed");
      });
    }

    return reply.status(200).send({ ok: true, deviceId: device.id, isNew });
  });
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Normalize a MAC address to lowercase colon-separated format.
 * Handles dash-separated (AA-BB-CC) and plain hex (AABBCC).
 */
function normalizeMac(mac: string): string {
  const clean = mac.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (clean.length !== 12) return mac.toLowerCase(); // return as-is if odd format
  return clean.match(/.{2}/g)!.join(":");
}

export default radiusRoutes;
