// ─────────────────────────────────────────────────────────────────────
//  NAS lookup with TTL cache.
//
//  Hot path: every incoming UDP packet must resolve to an enabled NAS
//  before we even attempt to parse it. We can't hit Postgres for each
//  packet at line-rate, so we keep an in-process map keyed on the
//  source IP literal, refreshed lazily.
//
//  The DB column `nasname` is either an IPv4 literal or a CIDR. We
//  prefer an exact match, falling back to the most-specific CIDR.
// ─────────────────────────────────────────────────────────────────────

import { prisma } from "./db.js";
import { config } from "./config.js";
import { log } from "./log.js";

export interface NasIdentity {
  id: string;
  nasname: string;       // the value stored in nas_clients.nasname
  shortname: string;
  secret: string;
  type: string;
  coaPort: number;
  enabled: boolean;
  siteId: string | null;
}

interface CacheEntry {
  expiresAt: number;
  value: NasIdentity | null; // null = negative cache (no match)
}

const cache = new Map<string, CacheEntry>();

interface NasLookupRow {
  id: string;
  nasname: string;
  shortname: string;
  secret: string;
  type: string;
  coaPort: number;
  enabled: boolean;
  siteId: string | null;
}

/**
 * Resolve a source IP to a NasClient. Caches both positive and
 * negative results for NAS_CACHE_TTL_MS.
 *
 * Negative caching matters because RFC 2865 §3 requires us to silently
 * drop packets from unknown clients — we don't want a flood of unknown
 * traffic to hit the DB every datagram.
 */
export async function lookupNasByIp(sourceIp: string): Promise<NasIdentity | null> {
  const now = Date.now();
  const cached = cache.get(sourceIp);
  if (cached && cached.expiresAt > now) return cached.value;

  // Single query: exact match first, then CIDR containment, then "best
  // match" wins (exact > narrower CIDR > wider CIDR). The expression
  // ordering uses Postgres' inet operators directly because the data
  // type stored in nasname is just a string.
  const rows = await prisma.$queryRaw<NasLookupRow[]>`
    SELECT
      id,
      nasname,
      shortname,
      secret,
      type,
      "coaPort",
      enabled,
      "siteId"
    FROM nas_clients
    WHERE enabled = true
      AND (
        nasname = ${sourceIp}
        OR (
          nasname ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
          AND ${sourceIp}::inet <<= nasname::inet
        )
      )
    ORDER BY
      (nasname = ${sourceIp}) DESC,
      -- narrower CIDRs first (longer prefix → larger /n)
      CASE
        WHEN nasname ~ '/'
        THEN (regexp_replace(nasname, '^.*/', ''))::int
        ELSE 32
      END DESC
    LIMIT 1;
  `;

  const value: NasIdentity | null = rows[0] ?? null;
  cache.set(sourceIp, { value, expiresAt: now + config().NAS_CACHE_TTL_MS });

  if (!value) {
    log.debug({ sourceIp }, "nas.lookup miss");
  }
  return value;
}

/**
 * Drop everything from the cache. Used by tests and any future
 * admin-triggered invalidation endpoint.
 */
export function clearNasCache() {
  cache.clear();
}
