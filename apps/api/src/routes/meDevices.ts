import type { FastifyPluginAsync } from "fastify";
import type { UserDevice as DeviceRecord } from "@prisma/client";
import type { UserDevice } from "@app/shared";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { BadRequest, Conflict, NotFound, Unauthorized } from "../lib/errors.js";
import { normalizeMac } from "../lib/mac.js";
import { verifyPassword } from "../lib/password.js";
import { disconnectUserSessions, listSessions } from "../services/sessions.js";

const CreateDeviceBody = z.object({
  mac: z.string().min(1).max(32),
  label: z.string().trim().max(80).nullish(),
  currentPassword: z.string().min(1),
});

const UpdateDeviceBody = z
  .object({
    label: z.string().trim().max(80).nullish(),
    isPrimary: z.boolean().optional(),
  })
  .refine((body) => body.label !== undefined || body.isPrimary !== undefined, "No device change provided");

const DeleteDeviceBody = z.object({ currentPassword: z.string().min(1) });
const MAX_DEVICES = 5;

function toDevice(device: DeviceRecord, observedAt?: Date | null): UserDevice {
  return {
    id:              device.id,
    mac:             device.mac,
    label:           device.label,
    isPrimary:       device.isPrimary,
    certFingerprint: device.certFingerprint,
    manufacturer:    device.manufacturer ?? null,
    deviceType:      device.deviceType,
    lastIp:          device.lastIp ?? null,
    learnedAt:       device.learnedAt.toISOString(),
    verifiedAt:      device.verifiedAt?.toISOString() ?? null,
    lastSeenAt:      (observedAt ?? device.lastSeenAt)?.toISOString() ?? null,
    status:          device.status,
  };
}

async function assertPassword(userId: string, password: string) {
  const secret = await prisma.userSecret.findUnique({ where: { userId } });
  if (!secret || !(await verifyPassword(secret.passwordHashArgon2id, password))) {
    throw Unauthorized("Current password is incorrect");
  }
}

async function devicesWithSightings(userId: string): Promise<UserDevice[]> {
  const [devices, sightings] = await Promise.all([
    prisma.userDevice.findMany({ where: { userId }, orderBy: [{ isPrimary: "desc" }, { learnedAt: "asc" }] }),
    prisma.$queryRaw<Array<{ deviceId: string; observedAt: Date | null }>>`
      SELECT
        d.id AS "deviceId",
        MAX(COALESCE(r.acctupdatetime, r.acctstoptime, r.acctstarttime)) AS "observedAt"
      FROM user_devices d
      JOIN users u ON u.id = d."userId"
      LEFT JOIN radacct r
        ON lower(r.username) = lower(u.username)
        AND regexp_replace(lower(r.callingstationid), '[^0-9a-f]', '', 'g') =
            regexp_replace(lower(d.mac), '[^0-9a-f]', '', 'g')
      WHERE d."userId" = ${userId}
      GROUP BY d.id;
    `,
  ]);
  const lastSeen = new Map(sightings.map((row) => [row.deviceId, row.observedAt]));
  return devices.map((device) => toDevice(device, lastSeen.get(device.id)));
}

const meDevices: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/me/devices", async (req) => devicesWithSightings(req.currentUser!.sub));

  app.post("/me/devices", async (req) => {
    const body = CreateDeviceBody.parse(req.body);
    const userId = req.currentUser!.sub;
    const mac = normalizeMac(body.mac);
    await assertPassword(userId, body.currentPassword);

    const device = await prisma.$transaction(async (tx) => {
      const count = await tx.userDevice.count({ where: { userId } });
      if (count >= MAX_DEVICES) throw BadRequest(`You can register up to ${MAX_DEVICES} devices`);
      const existing = await tx.userDevice.findUnique({ where: { userId_mac: { userId, mac } } });
      if (existing) throw Conflict("This MAC address is already registered");

      const created = await tx.userDevice.create({
        data: {
          userId,
          mac,
          label: body.label || null,
          isPrimary: count === 0,
          verifiedAt: new Date(),
        },
      });
      await audit({
        tx,
        actorId: userId,
        action: "user_update",
        targetType: "device",
        targetId: created.id,
        metadata: { event: "device.add", mac },
        req,
      });
      return created;
    });

    return toDevice(device);
  });

  app.patch<{ Params: { id: string } }>("/me/devices/:id", async (req) => {
    const body = UpdateDeviceBody.parse(req.body);
    const userId = req.currentUser!.sub;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.userDevice.findFirst({ where: { id: req.params.id, userId } });
      if (!existing) throw NotFound("Device not found");

      if (body.isPrimary === true) {
        await tx.userDevice.updateMany({ where: { userId }, data: { isPrimary: false } });
      }
      const device = await tx.userDevice.update({
        where: { id: existing.id },
        data: {
          label: body.label === undefined ? undefined : body.label || null,
          isPrimary: body.isPrimary,
        },
      });
      await audit({
        tx,
        actorId: userId,
        action: "user_update",
        targetType: "device",
        targetId: device.id,
        metadata: { event: "device.update", changes: body },
        req,
      });
      return device;
    });

    return toDevice(updated);
  });

  app.delete<{ Params: { id: string } }>("/me/devices/:id", async (req) => {
    const body = DeleteDeviceBody.parse(req.body);
    const userId = req.currentUser!.sub;
    await assertPassword(userId, body.currentPassword);

    const removed = await prisma.$transaction(async (tx) => {
      const device = await tx.userDevice.findFirst({ where: { id: req.params.id, userId } });
      if (!device) throw NotFound("Device not found");
      await tx.userDevice.delete({ where: { id: device.id } });
      await audit({
        tx,
        actorId: userId,
        action: "user_update",
        targetType: "device",
        targetId: device.id,
        metadata: { event: "device.remove", mac: device.mac },
        req,
      });
      return device;
    });

    const sessions = await disconnectUserSessions(req.currentUser!.username, removed.mac);
    if (sessions.length) {
      await audit({
        actorId: userId,
        action: "user_disconnect",
        targetType: "device",
        targetId: removed.id,
        metadata: {
          event: "device.remove.disconnect",
          attempts: sessions.map((session) => ({
            sessionId: session.sessionId,
            result: { ...session.result },
          })),
        },
        req,
      });
    }
    return { ok: true, disconnectedSessions: sessions };
  });

  app.get("/me/sessions", async (req) => {
    return listSessions({
      activeOnly: false,
      username: req.currentUser!.username,
      pageSize: 20,
    });
  });
};

export default meDevices;
