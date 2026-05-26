import { Prisma } from "@prisma/client";
import type { Paginated, RadiusSession } from "@app/shared";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { NotFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { config } from "../config.js";
import { sendDisconnectRequest, type CoaDispatchResult } from "./coa.js";

interface SessionRow {
  id: string;
  acctSessionId: string;
  username: string;
  nasIp: string;
  nasName: string | null;
  siteName: string | null;
  startedAt: Date | null;
  updatedAt: Date | null;
  stoppedAt: Date | null;
  durationSeconds: string;
  inputOctets: string;
  outputOctets: string;
  callingStationId: string;
  calledStationId: string;
  framedIpAddress: string | null;
  terminateCause: string;
  deviceLabel: string | null;
}

interface CoaTargetRow {
  id: string;
  username: string;
  acctSessionId: string;
  callingStationId: string;
  nasIp: string;
  coaPort: number | null;
  nasSecret: string | null;
}

interface ListSessionOptions {
  activeOnly?: boolean;
  username?: string;
  mac?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

interface PolicyDisconnectOptions {
  userId: string;
  actorId: string;
  reason: string;
  req?: FastifyRequest;
}

const nasJoin = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT configured.*
    FROM nas_clients configured
    WHERE configured.enabled = true
      AND (
        configured.nasname = host(r.nasipaddress)
        OR CASE
          WHEN configured.nasname ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
          THEN r.nasipaddress <<= configured.nasname::inet
          ELSE false
        END
      )
    ORDER BY (configured.nasname = host(r.nasipaddress)) DESC
    LIMIT 1
  ) n ON true
`;

function whereSql(opts: ListSessionOptions): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (opts.activeOnly !== false) clauses.push(Prisma.sql`r.acctstoptime IS NULL`);
  if (opts.username) clauses.push(Prisma.sql`lower(r.username) = lower(${opts.username})`);
  if (opts.mac) {
    clauses.push(
      Prisma.sql`regexp_replace(lower(r.callingstationid), '[^0-9a-f]', '', 'g') = regexp_replace(lower(${opts.mac}), '[^0-9a-f]', '', 'g')`,
    );
  }
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    clauses.push(
      Prisma.sql`(r.username ILIKE ${pattern} OR r.callingstationid ILIKE ${pattern} OR r.framedipaddress::text ILIKE ${pattern} OR n.shortname ILIKE ${pattern})`,
    );
  }
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

function toSession(row: SessionRow): RadiusSession {
  return {
    ...row,
    startedAt: row.startedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    stoppedAt: row.stoppedAt?.toISOString() ?? null,
  };
}

export async function listSessions(opts: ListSessionOptions = {}): Promise<Paginated<RadiusSession>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const where = whereSql(opts);
  const offset = (page - 1) * pageSize;

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<SessionRow[]>(Prisma.sql`
      SELECT
        r.radacctid::text AS id,
        r.acctsessionid AS "acctSessionId",
        r.username,
        host(r.nasipaddress) AS "nasIp",
        n.shortname AS "nasName",
        s.name AS "siteName",
        r.acctstarttime AS "startedAt",
        r.acctupdatetime AS "updatedAt",
        r.acctstoptime AS "stoppedAt",
        COALESCE(r.acctsessiontime, EXTRACT(EPOCH FROM (COALESCE(r.acctstoptime, now()) - r.acctstarttime)), 0)::bigint::text AS "durationSeconds",
        COALESCE(r.acctinputoctets, 0)::text AS "inputOctets",
        COALESCE(r.acctoutputoctets, 0)::text AS "outputOctets",
        r.callingstationid AS "callingStationId",
        r.calledstationid AS "calledStationId",
        host(r.framedipaddress) AS "framedIpAddress",
        r.acctterminatecause AS "terminateCause",
        device.label AS "deviceLabel"
      FROM radacct r
      ${nasJoin}
      LEFT JOIN sites s ON s.id = n."siteId"
      LEFT JOIN users u ON lower(u.username) = lower(r.username)
      LEFT JOIN LATERAL (
        SELECT ud.label
        FROM user_devices ud
        WHERE ud."userId" = u.id
          AND regexp_replace(lower(ud.mac), '[^0-9a-f]', '', 'g') =
              regexp_replace(lower(r.callingstationid), '[^0-9a-f]', '', 'g')
        LIMIT 1
      ) device ON true
      ${where}
      ORDER BY (r.acctstoptime IS NULL) DESC, COALESCE(r.acctupdatetime, r.acctstarttime) DESC NULLS LAST
      LIMIT ${pageSize} OFFSET ${offset};
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM radacct r
      ${nasJoin}
      ${where};
    `),
  ]);

  return { items: rows.map(toSession), total: totals[0]?.count ?? 0, page, pageSize };
}

async function coaTargets(opts: Pick<ListSessionOptions, "username" | "mac"> & { id?: string }) {
  const clauses: Prisma.Sql[] = [Prisma.sql`r.acctstoptime IS NULL`];
  if (opts.id) clauses.push(Prisma.sql`r.radacctid::text = ${opts.id}`);
  if (opts.username) clauses.push(Prisma.sql`lower(r.username) = lower(${opts.username})`);
  if (opts.mac) {
    clauses.push(
      Prisma.sql`regexp_replace(lower(r.callingstationid), '[^0-9a-f]', '', 'g') = regexp_replace(lower(${opts.mac}), '[^0-9a-f]', '', 'g')`,
    );
  }
  return prisma.$queryRaw<CoaTargetRow[]>(Prisma.sql`
    SELECT
      r.radacctid::text AS id,
      r.username,
      r.acctsessionid AS "acctSessionId",
      r.callingstationid AS "callingStationId",
      host(r.nasipaddress) AS "nasIp",
      n."coaPort" AS "coaPort",
      n.secret AS "nasSecret"
    FROM radacct r
    ${nasJoin}
    WHERE ${Prisma.join(clauses, " AND ")};
  `);
}

async function dispatch(target: CoaTargetRow): Promise<CoaDispatchResult> {
  if (!target.nasSecret || !target.coaPort) {
    return {
      sent: false,
      acknowledged: false,
      outcome: "not_configured",
      message: `No enabled NAS CoA configuration matches ${target.nasIp}`,
    };
  }
  return sendDisconnectRequest(
    {
      host: target.nasIp,
      port: target.coaPort,
      secret: target.nasSecret,
      username: target.username,
      acctSessionId: target.acctSessionId,
      callingStationId: target.callingStationId,
    },
    config().COA_TIMEOUT_MS,
  );
}

export async function disconnectSession(id: string) {
  const target = (await coaTargets({ id }))[0];
  if (!target) throw NotFound("Active session not found");
  return { sessionId: target.id, result: await dispatch(target) };
}

export async function disconnectUserSessions(username: string, mac?: string) {
  const targets = await coaTargets({ username, mac });
  return Promise.all(
    targets.map(async (target) => ({ sessionId: target.id, result: await dispatch(target) })),
  );
}

export async function disconnectForPolicyChange(opts: PolicyDisconnectOptions) {
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { username: true } });
  if (!user) throw NotFound("User not found");
  const attempts = await disconnectUserSessions(user.username);
  if (attempts.length) {
    await audit({
      actorId: opts.actorId,
      action: "user_disconnect",
      targetType: "user",
      targetId: opts.userId,
      metadata: {
        event: "policy.disconnect",
        reason: opts.reason,
        attempts: attempts.map((attempt) => ({
          sessionId: attempt.sessionId,
          result: { ...attempt.result },
        })),
      },
      req: opts.req,
    });
  }
  return attempts;
}
