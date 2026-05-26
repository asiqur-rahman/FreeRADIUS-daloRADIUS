// ─────────────────────────────────────────────────────────────────────
//  radacct write path.
//
//  Three operations, each idempotent under NAS retry storms:
//
//   - upsertSession: handles Start / Interim-Update / Stop. Keyed on
//     acctuniqueid, computed deterministically from the same fields
//     FreeRADIUS uses for acct_unique. Octet counters are monotonic
//     so we GREATEST() them on conflict — a duplicated old packet can
//     never make a session "shrink".
//
//   - closeNasSessions: triggered by Accounting-On / Accounting-Off,
//     which mean "the NAS rebooted, all my sessions are gone". We
//     close every still-open session for that NAS with the appropriate
//     terminate cause.
//
//   - The interface is exposed via AcctBackend so tests inject an
//     in-memory store rather than touching Postgres.
// ─────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { log } from "../log.js";
import { AcctStatusType, type AccountingRequest } from "./parse.js";

export interface AcctBackend {
  /** Idempotent write for Start / Interim-Update / Stop. */
  upsertSession(req: AccountingRequest): Promise<void>;
  /** Close every open session for the NAS (Accounting-On/Off). */
  closeNasSessions(nasIpAddress: string, cause: string): Promise<number>;
}

/**
 * acctuniqueid generator that mirrors what FreeRADIUS's acct_unique
 * module produces. Stable across the lifetime of a single session,
 * unique across concurrent sessions.
 *
 * The field set matches FreeRADIUS's default `key` setting:
 * User-Name | Acct-Session-Id | NAS-IP-Address | NAS-Identifier | NAS-Port.
 */
export function computeAcctUniqueId(req: AccountingRequest): string {
  const parts = [
    req.username,
    req.sessionId,
    req.nasIpAddress,
    req.nasIdentifier ?? "",
    req.nasPort === null ? "" : String(req.nasPort),
  ].join("/");
  return createHash("md5").update(parts).digest("hex");
}

// ── Postgres-backed implementation ─────────────────────────────────

export const prismaAcctBackend: AcctBackend = {
  upsertSession: async (req) => {
    const uniqueId = computeAcctUniqueId(req);
    const now = new Date();
    const isStart = req.statusType === AcctStatusType.Start;
    const isStop = req.statusType === AcctStatusType.Stop;

    // Compute the start/update/stop timestamps that should land in this row.
    //   - Start  → set acctstarttime; leave updatetime null until Interim.
    //   - Interim→ set acctupdatetime, leave stop time alone.
    //   - Stop   → set acctupdatetime + acctstoptime.
    // The COALESCE on UPDATE preserves whatever was already there.
    const acctStartTime = isStart ? now : null;
    const acctUpdateTime = req.statusType !== AcctStatusType.Start ? now : null;
    const acctStopTime = isStop ? now : null;

    try {
      // Cast BigInt octets to string for the SQL driver — node-postgres
      // accepts strings for BIGINT and avoids the JS precision loss above 2^53.
      const inputOctets = req.inputOctets.toString();
      const outputOctets = req.outputOctets.toString();

      await prisma.$executeRaw`
        INSERT INTO radacct (
          acctsessionid, acctuniqueid, username, nasipaddress,
          nasportid, nasporttype,
          acctstarttime, acctupdatetime, acctstoptime,
          acctsessiontime, acctauthentic,
          acctinputoctets, acctoutputoctets,
          calledstationid, callingstationid,
          acctterminatecause, servicetype, framedprotocol,
          framedipaddress,
          class
        )
        VALUES (
          ${req.sessionId}, ${uniqueId}, ${req.username}, ${req.nasIpAddress}::inet,
          ${req.nasPort === null ? null : String(req.nasPort)}, ${req.nasPortType},
          ${acctStartTime}, ${acctUpdateTime}, ${acctStopTime},
          ${req.sessionTime}, ${req.acctAuthentic},
          ${inputOctets}::bigint, ${outputOctets}::bigint,
          ${req.calledStationId}, ${req.callingStationId},
          ${req.terminateCause}, ${req.serviceType}, ${req.framedProtocol},
          ${req.framedIpAddress === null ? null : `${req.framedIpAddress}`}::inet,
          ${req.klass}
        )
        ON CONFLICT (acctuniqueid) DO UPDATE SET
          -- Always advance update time on Interim/Stop, leave Start untouched.
          acctupdatetime  = COALESCE(EXCLUDED.acctupdatetime, radacct.acctupdatetime),
          -- Stop time is sticky once set.
          acctstoptime    = COALESCE(radacct.acctstoptime, EXCLUDED.acctstoptime),
          -- Session-time only grows.
          acctsessiontime = GREATEST(
            COALESCE(EXCLUDED.acctsessiontime, 0),
            COALESCE(radacct.acctsessiontime, 0)
          ),
          acctinputoctets  = GREATEST(
            COALESCE(EXCLUDED.acctinputoctets, 0),
            COALESCE(radacct.acctinputoctets, 0)
          ),
          acctoutputoctets = GREATEST(
            COALESCE(EXCLUDED.acctoutputoctets, 0),
            COALESCE(radacct.acctoutputoctets, 0)
          ),
          -- Only overwrite terminate cause if the new packet is a Stop and
          -- the existing row didn't already record one.
          acctterminatecause = CASE
            WHEN EXCLUDED.acctstoptime IS NOT NULL AND radacct.acctterminatecause = ''
              THEN EXCLUDED.acctterminatecause
            ELSE radacct.acctterminatecause
          END,
          framedipaddress = COALESCE(EXCLUDED.framedipaddress, radacct.framedipaddress);
      `;
    } catch (err) {
      // Don't let DB hiccups break the response — log and acknowledge
      // (otherwise the NAS retry-storms us forever).
      log.error({ err, sessionId: req.sessionId, uniqueId }, "acct.upsert_failed");
    }
  },

  closeNasSessions: async (nasIpAddress, cause) => {
    try {
      const result = await prisma.$executeRaw`
        UPDATE radacct
           SET acctstoptime       = COALESCE(acctstoptime, now()),
               acctterminatecause = CASE
                 WHEN acctterminatecause = '' THEN ${cause}
                 ELSE acctterminatecause
               END
         WHERE nasipaddress = ${nasIpAddress}::inet
           AND acctstoptime IS NULL;
      `;
      return Number(result);
    } catch (err) {
      log.error({ err, nasIpAddress }, "acct.close_nas_sessions_failed");
      return 0;
    }
  },
};
