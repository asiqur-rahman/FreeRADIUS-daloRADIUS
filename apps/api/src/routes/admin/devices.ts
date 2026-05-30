import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type {
  AdminDeviceSummary,
  DeviceCertificateBundleResponse,
  DeviceCertificateClearResponse,
  DeviceCertificateImportRequest,
  DeviceCertificateImportResponse,
  DeviceCertificateSummary,
  DeviceDecisionRequest,
  GenerateDeviceCertificateRequest,
  Paginated,
} from "@app/shared";
import { prisma } from "../../db.js";
import { NotFound } from "../../lib/errors.js";
import { decideDevice } from "../../services/deviceApprovals.js";
import {
  bindImportedDeviceCertificate,
  clearDeviceCertificate,
  generateManagedDeviceCertificate,
} from "../../services/deviceCertificates.js";

const deviceInclude = {
  user: {
    select: {
      id:       true,
      username: true,
      fullName: true,
      email:    true,
    },
  },
} satisfies Prisma.UserDeviceInclude;

type DeviceWithRelations = Prisma.UserDeviceGetPayload<{ include: typeof deviceInclude }>;

const ListDevicesQuery = z.object({
  status:   z.enum(["pending", "approved", "rejected", "blocked"]).optional(),
  userId:   z.string().optional(),
  search:   z.string().trim().max(120).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

const DecideDeviceBody = z.object({
  status: z.enum(["approved", "rejected", "blocked"]),
  notes:  z.string().trim().max(500).nullish(),
});

const ImportDeviceCertificateBody = z.object({
  pem:     z.string().min(64, "Expected a PEM-encoded X.509 certificate"),
  approve: z.boolean().default(false),
  notes:   z.string().trim().max(500).nullish(),
});

const GenerateDeviceCertificateBody = z.object({
  commonName:     z.string().trim().max(64).nullish(),
  sanEmail:       z.string().trim().max(254).email().nullish(),
  pkcs12Password: z.string().trim().min(8).max(128).nullish(),
  approve:        z.boolean().default(true),
  notes:          z.string().trim().max(500).nullish(),
});

const ClearDeviceCertificateBody = z.object({
  notes: z.string().trim().max(500).nullish(),
});

function toAdminDevice(device: DeviceWithRelations): AdminDeviceSummary {
  return {
    id:              device.id,
    userId:          device.userId,
    username:        device.user.username,
    fullName:        device.user.fullName,
    email:           device.user.email,
    mac:             device.mac,
    label:           device.label,
    isPrimary:       device.isPrimary,
    certFingerprint: device.certFingerprint,
    manufacturer:    device.manufacturer ?? null,
    deviceType:      device.deviceType,
    lastIp:          device.lastIp ?? null,
    learnedAt:       device.learnedAt.toISOString(),
    verifiedAt:      device.verifiedAt?.toISOString() ?? null,
    lastSeenAt:      device.lastSeenAt?.toISOString() ?? null,
    status:          device.status,
    decidedAt:       device.decidedAt?.toISOString() ?? null,
    decidedBy:       device.decidedBy ?? null,
    decisionNote:    device.decisionNote ?? null,
  };
}

async function loadAdminDevice(id: string): Promise<AdminDeviceSummary> {
  const device = await prisma.userDevice.findUnique({
    where:   { id },
    include: deviceInclude,
  });
  if (!device) throw NotFound("Device not found");
  return toAdminDevice(device);
}

function deviceWhere(
  query: z.infer<typeof ListDevicesQuery>,
  userId = query.userId,
): Prisma.UserDeviceWhereInput {
  const where: Prisma.UserDeviceWhereInput = {};
  if (query.status) where.status = query.status;
  if (userId) where.userId = userId;
  if (query.search) {
    where.OR = [
      { mac:   { contains: query.search, mode: "insensitive" } },
      { label: { contains: query.search, mode: "insensitive" } },
      { manufacturer: { contains: query.search, mode: "insensitive" } },
      { user: { is: { username: { contains: query.search, mode: "insensitive" } } } },
      { user: { is: { fullName: { contains: query.search, mode: "insensitive" } } } },
      { user: { is: { email:    { contains: query.search, mode: "insensitive" } } } },
    ];
  }
  return where;
}

const adminDevices: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  // GET /admin/devices — all devices with optional filters
  app.get("/devices", async (req) => {
    const query = ListDevicesQuery.parse(req.query);
    const where = deviceWhere(query);

    const [items, total] = await Promise.all([
      prisma.userDevice.findMany({
        where,
        include:  deviceInclude,
        orderBy:  [{ status: "asc" }, { lastSeenAt: "desc" }, { learnedAt: "desc" }],
        skip:     (query.page - 1) * query.pageSize,
        take:     query.pageSize,
      }),
      prisma.userDevice.count({ where }),
    ]);

    const body: Paginated<AdminDeviceSummary> = {
      items: items.map(toAdminDevice),
      total,
      page:     query.page,
      pageSize: query.pageSize,
    };
    return body;
  });

  // GET /admin/users/:id/devices — all devices for a specific user
  app.get<{ Params: { id: string } }>("/users/:id/devices", async (req) => {
    const user = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { id: true },
    });
    if (!user) throw NotFound("User not found");

    const query = ListDevicesQuery.parse(req.query);
    const where = deviceWhere(query, req.params.id);
    const [items, total] = await Promise.all([
      prisma.userDevice.findMany({
        where,
        include:  deviceInclude,
        orderBy:  [{ status: "asc" }, { lastSeenAt: "desc" }, { learnedAt: "desc" }],
        skip:     (query.page - 1) * query.pageSize,
        take:     query.pageSize,
      }),
      prisma.userDevice.count({ where }),
    ]);

    const body: Paginated<AdminDeviceSummary> = {
      items: items.map(toAdminDevice),
      total,
      page:     query.page,
      pageSize: query.pageSize,
    };
    return body;
  });

  // PATCH /admin/devices/:id — accept / reject / block
  app.patch<{ Params: { id: string }; Body: DeviceDecisionRequest }>("/devices/:id", async (req) => {
    const body = DecideDeviceBody.parse(req.body);
    const decision = await decideDevice({
      deviceId:   req.params.id,
      status:     body.status,
      actorId:    req.currentUser!.sub,
      actorLabel: req.currentUser!.username,
      source:     "admin_api",
      notes:      body.notes ?? null,
      req,
    });

    const device = await prisma.userDevice.findUnique({
      where:   { id: req.params.id },
      include: deviceInclude,
    });
    if (!device) throw NotFound("Device not found");

    return {
      ok:                   true,
      alreadyApplied:       decision.alreadyApplied,
      disconnectedSessions: decision.disconnectAttempts.length,
      disconnectAttempts:   decision.disconnectAttempts,
      device:               toAdminDevice(device),
    };
  });

  // Certificate management routes (unchanged)
  app.post<{ Params: { id: string }; Body: DeviceCertificateImportRequest }>(
    "/devices/:id/certificate/import",
    async (req): Promise<DeviceCertificateImportResponse> => {
      const body   = ImportDeviceCertificateBody.parse(req.body);
      const result = await bindImportedDeviceCertificate({
        deviceId:   req.params.id,
        pem:        body.pem,
        approve:    body.approve,
        notes:      body.notes ?? null,
        actorId:    req.currentUser!.sub,
        actorLabel: req.currentUser!.username,
        req,
      });
      return {
        ok:                   true,
        alreadyBound:         result.alreadyBound,
        approvalChanged:      result.approvalChanged,
        disconnectedSessions: result.disconnectedSessions,
        device:               await loadAdminDevice(result.deviceId),
        certificate:          result.certificate as DeviceCertificateSummary,
      };
    },
  );

  app.post<{ Params: { id: string }; Body: GenerateDeviceCertificateRequest }>(
    "/devices/:id/certificate/generate",
    async (req): Promise<DeviceCertificateBundleResponse> => {
      const body   = GenerateDeviceCertificateBody.parse(req.body);
      const result = await generateManagedDeviceCertificate({
        deviceId:       req.params.id,
        commonName:     body.commonName ?? null,
        sanEmail:       body.sanEmail ?? null,
        pkcs12Password: body.pkcs12Password ?? null,
        approve:        body.approve,
        notes:          body.notes ?? null,
        actorId:        req.currentUser!.sub,
        actorLabel:     req.currentUser!.username,
        req,
      });
      return {
        ok:                   true,
        alreadyBound:         result.alreadyBound,
        approvalChanged:      result.approvalChanged,
        disconnectedSessions: result.disconnectedSessions,
        device:               await loadAdminDevice(result.deviceId),
        certificate:          result.certificate as DeviceCertificateSummary,
        certificatePem:       result.certificatePem,
        privateKeyPem:        result.privateKeyPem,
        pkcs12Base64:         result.pkcs12Base64,
        pkcs12Password:       result.pkcs12Password,
      };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/devices/:id/certificate",
    async (req): Promise<DeviceCertificateClearResponse> => {
      const body   = ClearDeviceCertificateBody.parse(req.body ?? {});
      const result = await clearDeviceCertificate({
        deviceId:   req.params.id,
        actorId:    req.currentUser!.sub,
        actorLabel: req.currentUser!.username,
        notes:      body.notes ?? null,
        req,
      });
      return {
        ok:                   true,
        alreadyCleared:       result.alreadyCleared,
        approvalChanged:      result.approvalChanged,
        disconnectedSessions: result.disconnectedSessions,
        device:               await loadAdminDevice(result.deviceId),
        certificate:          null,
      };
    },
  );
};

export default adminDevices;
