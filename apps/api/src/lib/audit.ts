// Convenience for writing audit-log rows from any route/service.
// Pass through a transaction client when the audit must succeed atomically
// with the underlying mutation (the architecture doc's transactional rule).
import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";

type Db = Prisma.TransactionClient | typeof prisma;

interface AuditOpts {
  tx?: Db;
  actorId?: string | null;
  action: Prisma.AuditLogCreateInput["action"];
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  req?: FastifyRequest;
}

export async function audit(opts: AuditOpts) {
  const db = opts.tx ?? prisma;
  return db.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId ?? null,
      metadata: opts.metadata ?? undefined,
      ip: opts.req?.ip ?? null,
      userAgent: opts.req?.headers["user-agent"]?.toString() ?? null,
    },
  });
}
