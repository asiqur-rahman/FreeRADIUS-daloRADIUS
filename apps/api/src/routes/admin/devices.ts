import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type {
  AdminDeviceSummary,
  DeviceApprovalEntry,
  DeviceDecisionRequest,
  Paginated,
} from "@app/shared";
import { prisma } from "../../db.js";
import { NotFound } from "../../lib/errors.js";
import { decideDevice } from "../../services/deviceApprovals.js";

const deviceInclude = {
  user: {
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
    },
  },
  approvals: {
    orderBy: { requestedAt: "desc" as const },
    take: 1,
    include: {
      admin: {
        select: {
          username: true,
        },
      },
    },
  },
} satisfies Prisma.UserDeviceInclude;

type DeviceWithRelations = Prisma.UserDeviceGetPayload<{ include: typeof deviceInclude }>;

const approvalInclude = {
  device: {
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
  },
  admin: {
    select: {
      username: true,
    },
  },
} satisfies Prisma.DeviceApprovalInclude;

type ApprovalWithRelations = Prisma.DeviceApprovalGetPayload<{ include: typeof approvalInclude }>;

const ListDevicesQuery = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  userId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const DecideDeviceBody = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(500).nullish(),
});

const ListApprovalsQuery = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  userId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function toAdminDevice(device: DeviceWithRelations): AdminDeviceSummary {
  const latestApproval = device.approvals[0];
  return {
    id: device.id,
    userId: device.userId,
    username: device.user.username,
    fullName: device.user.fullName,
    email: device.user.email,
    mac: device.mac,
    label: device.label,
    isPrimary: device.isPrimary,
    certFingerprint: device.certFingerprint,
    learnedAt: device.learnedAt.toISOString(),
    verifiedAt: device.verifiedAt?.toISOString() ?? null,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    status: device.status,
    requestedAt: latestApproval?.requestedAt.toISOString() ?? null,
    decidedAt: latestApproval?.decidedAt?.toISOString() ?? null,
    decidedBy: latestApproval?.admin?.username ?? null,
    decisionNotes: latestApproval?.notes ?? null,
  };
}

function toApprovalEntry(entry: ApprovalWithRelations): DeviceApprovalEntry {
  return {
    id: entry.id,
    deviceId: entry.deviceId,
    userId: entry.device.user.id,
    username: entry.device.user.username,
    fullName: entry.device.user.fullName,
    email: entry.device.user.email,
    mac: entry.device.mac,
    deviceLabel: entry.device.label,
    status: entry.status,
    requestedAt: entry.requestedAt.toISOString(),
    decidedAt: entry.decidedAt?.toISOString() ?? null,
    decidedBy: entry.admin?.username ?? null,
    notes: entry.notes ?? null,
  };
}

function deviceWhere(query: z.infer<typeof ListDevicesQuery>, userId = query.userId): Prisma.UserDeviceWhereInput {
  const where: Prisma.UserDeviceWhereInput = {};
  if (query.status) where.status = query.status;
  if (userId) where.userId = userId;
  if (query.search) {
    where.OR = [
      { mac: { contains: query.search, mode: "insensitive" } },
      { label: { contains: query.search, mode: "insensitive" } },
      { user: { is: { username: { contains: query.search, mode: "insensitive" } } } },
      { user: { is: { fullName: { contains: query.search, mode: "insensitive" } } } },
      { user: { is: { email: { contains: query.search, mode: "insensitive" } } } },
    ];
  }
  return where;
}

const adminDevices: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  app.get("/devices", async (req) => {
    const query = ListDevicesQuery.parse(req.query);
    const where = deviceWhere(query);

    const [items, total] = await Promise.all([
      prisma.userDevice.findMany({
        where,
        include: deviceInclude,
        orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }, { learnedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.userDevice.count({ where }),
    ]);

    const body: Paginated<AdminDeviceSummary> = {
      items: items.map(toAdminDevice),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return body;
  });

  app.get<{ Params: { id: string } }>("/users/:id/devices", async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) throw NotFound("User not found");

    const query = ListDevicesQuery.parse(req.query);
    const where = deviceWhere(query, req.params.id);
    const [items, total] = await Promise.all([
      prisma.userDevice.findMany({
        where,
        include: deviceInclude,
        orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }, { learnedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.userDevice.count({ where }),
    ]);

    const body: Paginated<AdminDeviceSummary> = {
      items: items.map(toAdminDevice),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return body;
  });

  app.patch<{ Params: { id: string }; Body: DeviceDecisionRequest }>("/devices/:id", async (req) => {
    const body = DecideDeviceBody.parse(req.body);
    const decision = await decideDevice({
      deviceId: req.params.id,
      status: body.status,
      actorId: req.currentUser!.sub,
      actorLabel: req.currentUser!.username,
      source: "admin_api",
      notes: body.notes ?? null,
      req,
    });

    const device = await prisma.userDevice.findUnique({
      where: { id: req.params.id },
      include: deviceInclude,
    });
    if (!device) throw NotFound("Device not found");

    return {
      ok: true,
      alreadyApplied: decision.alreadyApplied,
      disconnectedSessions: decision.disconnectAttempts.length,
      disconnectAttempts: decision.disconnectAttempts,
      device: toAdminDevice(device),
    };
  });

  app.get("/approvals", async (req) => {
    const query = ListApprovalsQuery.parse(req.query);

    const where: Prisma.DeviceApprovalWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.device = { is: { userId: query.userId } };
    if (query.search) {
      where.OR = [
        { device: { is: { mac: { contains: query.search, mode: "insensitive" } } } },
        { device: { is: { label: { contains: query.search, mode: "insensitive" } } } },
        { device: { is: { user: { is: { username: { contains: query.search, mode: "insensitive" } } } } } },
        { device: { is: { user: { is: { fullName: { contains: query.search, mode: "insensitive" } } } } } },
        { notes: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.deviceApproval.findMany({
        where,
        include: approvalInclude,
        orderBy: [{ requestedAt: "desc" }, { decidedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.deviceApproval.count({ where }),
    ]);

    const body: Paginated<DeviceApprovalEntry> = {
      items: items.map(toApprovalEntry),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return body;
  });
};

export default adminDevices;
