import type { DeviceStatus } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { emitPlatformEvent } from "../lib/events.js";
import { NotFound } from "../lib/errors.js";
import { notifyTelegramDecision } from "../lib/telegram.js";
import { disconnectUserSessions } from "./sessions.js";

type DecisionStatus = Exclude<DeviceStatus, "pending">;
type DisconnectAttempt = Awaited<ReturnType<typeof disconnectUserSessions>>[number];

interface DecideDeviceOptions {
  deviceId: string;
  status: DecisionStatus;
  actorId?: string | null;
  actorLabel?: string | null;
  source: "telegram" | "admin_api";
  notes?: string | null;
  req?: FastifyRequest;
}

interface DecisionDevice {
  id: string;
  userId: string;
  mac: string;
  status: DeviceStatus;
  verifiedAt: Date | null;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    email: string;
  };
}

export interface DeviceDecisionResult {
  device: DecisionDevice;
  alreadyApplied: boolean;
  disconnectAttempts: DisconnectAttempt[];
}

function decisionNote(opts: DecideDeviceOptions): string {
  if (opts.notes?.trim()) return opts.notes.trim();
  const actor = opts.actorLabel?.trim() || "operator";
  const via = opts.source === "telegram" ? "Telegram" : "admin dashboard";
  return `${opts.status} via ${via} by ${actor}`;
}

export async function decideDevice(opts: DecideDeviceOptions): Promise<DeviceDecisionResult> {
  const note = decisionNote(opts);

  const outcome = await prisma.$transaction(async (tx) => {
    const device = await tx.userDevice.findUnique({
      where: { id: opts.deviceId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
    if (!device) throw NotFound("Device not found");

    const now = new Date();
    const pendingCount = await tx.deviceApproval.count({
      where: { deviceId: opts.deviceId, status: "pending" },
    });
    const alreadyApplied = pendingCount === 0 && device.status === opts.status;

    if (alreadyApplied) {
      return { device, alreadyApplied: true };
    }

    if (pendingCount > 0) {
      await tx.deviceApproval.updateMany({
        where: { deviceId: opts.deviceId, status: "pending" },
        data: {
          status: opts.status,
          decidedAt: now,
          decidedBy: opts.actorId ?? null,
          notes: note,
        },
      });
    } else {
      await tx.deviceApproval.create({
        data: {
          deviceId: opts.deviceId,
          requestedAt: now,
          decidedAt: now,
          decidedBy: opts.actorId ?? null,
          status: opts.status,
          notes: note,
        },
      });
    }

    const updated = await tx.userDevice.update({
      where: { id: opts.deviceId },
      data: {
        status: opts.status,
        verifiedAt: opts.status === "approved" ? device.verifiedAt ?? now : null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await audit({
      tx,
      actorId: opts.actorId ?? null,
      action: opts.status === "approved" ? "device_approve" : "device_reject",
      targetType: "device",
      targetId: updated.id,
      metadata: {
        username: updated.user.username,
        mac: updated.mac,
        previousStatus: device.status,
        newStatus: opts.status,
        source: opts.source,
        notes: note,
        pendingRequestsResolved: pendingCount,
      },
      req: opts.req,
    });

    return { device: updated, alreadyApplied: false };
  });

  if (outcome.alreadyApplied) {
    return { device: outcome.device, alreadyApplied: true, disconnectAttempts: [] };
  }

  const disconnectAttempts = await disconnectUserSessions(outcome.device.user.username, outcome.device.mac);
  if (disconnectAttempts.length > 0) {
    await audit({
      actorId: opts.actorId ?? null,
      action: "user_disconnect",
      targetType: "device",
      targetId: outcome.device.id,
      metadata: {
        event: "device.decision.disconnect",
        source: opts.source,
        newStatus: opts.status,
        attempts: disconnectAttempts.map((attempt) => ({
          sessionId: attempt.sessionId,
          result: { ...attempt.result },
        })),
      },
      req: opts.req,
    });
  }

  // Notify SSE subscribers so admin dashboards update immediately
  emitPlatformEvent("device.decided", {
    deviceId: outcome.device.id,
    username: outcome.device.user.username,
    mac: outcome.device.mac,
    status: opts.status,
    source: opts.source,
  });

  // When decided via the web admin, edit the Telegram approval message so
  // both channels stay in sync.
  if (opts.source === "admin_api") {
    notifyTelegramDecision({
      deviceId:    outcome.device.id,
      status:      opts.status,
      deciderName: opts.actorLabel ?? "admin",
    }).catch((err) => {
      // Non-fatal — don't block the response if Telegram is unreachable.
      void err;
    });
  }

  return {
    device: outcome.device,
    alreadyApplied: false,
    disconnectAttempts,
  };
}
