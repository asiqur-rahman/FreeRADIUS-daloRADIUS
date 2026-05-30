import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthenticationEvent, AuditLogEntry, OperationalAlert, OperationsOverview, Paginated } from "@app/shared";
import { prisma } from "../../db.js";
import { config } from "../../config.js";

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

interface TrendRow {
  hour: Date;
  accepts: number;
  rejects: number;
}

interface SiteSessionRow {
  site: string;
  sessions: number;
}

interface RejectReasonRow {
  reason: string;
  count: number;
}

interface AuthTotalsRow {
  accepts: number;
  total: number;
}

interface SilentNasRow {
  id: string;
  shortname: string;
  nasname: string;
  lastAccountingAt: Date | null;
}

interface RadiusEventRow {
  id: string;
  username: string;
  type: string;
  source: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}

function certificateAlert(cert: { id: string; subject: string; expiresAt: Date }): OperationalAlert {
  const days = Math.ceil((cert.expiresAt.getTime() - Date.now()) / 86_400_000);
  return {
    id: `cert-${cert.id}`,
    severity: days <= 7 ? "critical" : "warning",
    title: days < 0 ? "Active EAP certificate expired" : `Active EAP certificate expires in ${days} days`,
    detail: `${cert.subject} expires ${cert.expiresAt.toISOString().slice(0, 10)}.`,
    observedAt: new Date().toISOString(),
  };
}

const adminOperations: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize(["admin"]));

  app.get("/operations/overview", async () => {
    const c = config();
    const silentSince = new Date(Date.now() - c.ALERT_NAS_SILENT_MINUTES * 60_000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    const certificateHorizon = new Date(Date.now() + 60 * 86_400_000);

    const [
      activeUsers,
      activeSessions,
      totalNas,
      enabledNas,
      totals,
      trend,
      siteSessions,
      rejectReasons,
      expiringCertificates,
      silentNas,
      recentRejects,
    ] = await Promise.all([
      prisma.user.count({ where: { status: "active" } }),
      prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM radacct WHERE acctstoptime IS NULL;`,
      prisma.nasClient.count(),
      prisma.nasClient.count({ where: { enabled: true } }),
      prisma.$queryRaw<AuthTotalsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE upper(reply) LIKE '%ACCEPT%')::int AS accepts,
          COUNT(*)::int AS total
        FROM radpostauth
        WHERE authdate >= now() - INTERVAL '24 hours';
      `,
      prisma.$queryRaw<TrendRow[]>`
        SELECT
          date_trunc('hour', authdate) AS hour,
          COUNT(*) FILTER (WHERE upper(reply) LIKE '%ACCEPT%')::int AS accepts,
          COUNT(*) FILTER (WHERE upper(reply) NOT LIKE '%ACCEPT%')::int AS rejects
        FROM radpostauth
        WHERE authdate >= now() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', authdate)
        ORDER BY hour ASC;
      `,
      prisma.$queryRaw<SiteSessionRow[]>`
        SELECT COALESCE(s.name, n.shortname, host(r.nasipaddress)) AS site, COUNT(*)::int AS sessions
        FROM radacct r
        LEFT JOIN nas_clients n ON n.nasname = host(r.nasipaddress)
        LEFT JOIN sites s ON s.id = n."siteId"
        WHERE r.acctstoptime IS NULL
        GROUP BY COALESCE(s.name, n.shortname, host(r.nasipaddress))
        ORDER BY sessions DESC
        LIMIT 8;
      `,
      prisma.$queryRaw<RejectReasonRow[]>`
        SELECT COALESCE(NULLIF(reply, ''), 'Rejected') AS reason, COUNT(*)::int AS count
        FROM radpostauth
        WHERE authdate >= now() - INTERVAL '24 hours'
          AND upper(reply) NOT LIKE '%ACCEPT%'
        GROUP BY COALESCE(NULLIF(reply, ''), 'Rejected')
        ORDER BY count DESC
        LIMIT 5;
      `,
      prisma.eapCertificate.findMany({
        where: { isActive: true, expiresAt: { lte: certificateHorizon } },
        orderBy: { expiresAt: "asc" },
      }),
      prisma.$queryRaw<SilentNasRow[]>`
        SELECT n.id, n.shortname, n.nasname, MAX(COALESCE(r.acctupdatetime, r.acctstarttime)) AS "lastAccountingAt"
        FROM nas_clients n
        LEFT JOIN radacct r ON (
          host(r.nasipaddress) = n.nasname
          OR CASE
            WHEN n.nasname ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
            THEN r.nasipaddress <<= n.nasname::inet
            ELSE false
          END
        )
        WHERE n.enabled = true
        GROUP BY n.id, n.shortname, n.nasname
        HAVING MAX(COALESCE(r.acctupdatetime, r.acctstarttime)) IS NULL
          OR MAX(COALESCE(r.acctupdatetime, r.acctstarttime)) < ${silentSince}
        ORDER BY "lastAccountingAt" ASC NULLS FIRST
        LIMIT 10;
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM radpostauth
        WHERE authdate >= ${fiveMinutesAgo}
          AND upper(reply) NOT LIKE '%ACCEPT%';
      `,
    ]);

    const alerts: OperationalAlert[] = expiringCertificates.map(certificateAlert);
    alerts.push(
      ...silentNas.map((nas) => ({
        id: `nas-${nas.id}`,
        severity: "warning" as const,
        title: `${nas.shortname} has no recent accounting traffic`,
        detail: nas.lastAccountingAt
          ? `Last activity ${nas.lastAccountingAt.toISOString()}.`
          : `No accounting activity recorded for ${nas.nasname}.`,
        observedAt: new Date().toISOString(),
      })),
    );
    if ((recentRejects[0]?.count ?? 0) >= c.ALERT_REJECT_THRESHOLD_5M) {
      alerts.unshift({
        id: "reject-spike",
        severity: "critical",
        title: "Authentication reject spike detected",
        detail: `${recentRejects[0]!.count} rejects in the last 5 minutes.`,
        observedAt: new Date().toISOString(),
      });
    }

    const authTotal = totals[0]?.total ?? 0;
    const body: OperationsOverview = {
      activeUsers,
      activeSessions: activeSessions[0]?.count ?? 0,
      enabledNas,
      totalNas,
      authSuccessRate24h: authTotal ? Math.round(((totals[0]?.accepts ?? 0) / authTotal) * 1000) / 10 : null,
      authenticationTrend: trend.map((row) => ({
        hour: row.hour.toISOString(),
        accepts: row.accepts,
        rejects: row.rejects,
      })),
      sessionsBySite: siteSessions,
      rejectReasons,
      alerts,
    };
    return body;
  });

  app.get("/audit-logs", async (req) => {
    const q = PageQuery.parse(req.query);
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { actor: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count(),
    ]);
    const items: AuditLogEntry[] = entries.map((entry) => ({
      id: entry.id,
      actor: entry.actor?.username ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ip: entry.ip,
      createdAt: entry.createdAt.toISOString(),
    }));
    return { items, total, page: q.page, pageSize: q.pageSize } satisfies Paginated<AuditLogEntry>;
  });

  app.get("/auth-events", async (req) => {
    const q = PageQuery.parse(req.query);
    const take = q.page * q.pageSize;
    const [webEvents, radiusEvents, webTotal, radiusTotal] = await Promise.all([
      prisma.authEvent.findMany({ orderBy: { createdAt: "desc" }, take }),
      prisma.$queryRaw<RadiusEventRow[]>`
        SELECT
          ('radius-' || id::text) AS id,
          username,
          CASE WHEN upper(reply) LIKE '%ACCEPT%' THEN 'radius_accept' ELSE 'radius_reject' END AS type,
          'radius' AS source,
          jsonb_build_object('reply', reply, 'callingStationId', callingstationid, 'calledStationId', calledstationid) AS metadata,
          authdate AS "createdAt"
        FROM radpostauth
        ORDER BY authdate DESC
        LIMIT ${take};
      `,
      prisma.authEvent.count(),
      prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM radpostauth;`,
    ]);
    const merged: AuthenticationEvent[] = [
      ...webEvents.map((event) => ({
        id: event.id,
        username: event.username,
        type: event.type,
        source: event.source,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      ...radiusEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return { items: merged, total: webTotal + (radiusTotal[0]?.count ?? 0), page: q.page, pageSize: q.pageSize };
  });
};

export default adminOperations;
