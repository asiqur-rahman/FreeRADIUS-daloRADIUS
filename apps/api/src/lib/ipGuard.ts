// ─────────────────────────────────────────────────────────────────────
//  RADIUS hook IP allowlist guard.
//
//  When RADIUS_IP_GUARD_ENABLED=true, the /radius/* preHandler calls
//  isIpAllowed(req.ip) before passing the request through.
//
//  Rules are loaded from the radius_allowed_ips table and cached in
//  memory for CACHE_TTL_MS (30 s) to avoid a DB round-trip on every
//  RADIUS auth.
//
//  An empty table is treated as "allow all" so a fresh install with the
//  flag enabled doesn't accidentally block FreeRADIUS until the first
//  rule is added.
// ─────────────────────────────────────────────────────────────────────

import { prisma } from "../db.js";

// ── IPv4 CIDR matching ────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;
  return (
    parts.reduce((acc, part) => {
      const n = parseInt(part, 10);
      return isNaN(n) || n < 0 || n > 255 ? NaN : (acc << 8) | n;
    }, 0) >>> 0
  );
}

function cidrMatchV4(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) {
    return ip === cidr;
  }
  const slashIdx = cidr.lastIndexOf("/");
  const network = cidr.slice(0, slashIdx);
  const prefixStr = cidr.slice(slashIdx + 1);
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : ((~0 << (32 - prefix)) >>> 0);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (isNaN(ipInt) || isNaN(netInt)) return false;
  return (ipInt & mask) === (netInt & mask);
}

function ipMatches(raw: string, cidr: string): boolean {
  // Strip IPv6-mapped IPv4 (::ffff:x.x.x.x → x.x.x.x)
  const ip = raw.replace(/^::ffff:/i, "");
  return cidrMatchV4(ip, cidr);
}

// ── In-memory cache ───────────────────────────────────────────────────

interface GuardCache {
  cidrs: string[];
  loadedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
let cache: GuardCache | null = null;

async function loadCidrs(): Promise<string[]> {
  const rows = await prisma.radiusAllowedIp.findMany({
    where: { enabled: true },
    select: { cidr: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.cidr);
}

/** Check whether a source IP is permitted to call the RADIUS hook. */
export async function isIpAllowed(ip: string): Promise<boolean> {
  const now = Date.now();
  if (!cache || now - cache.loadedAt > CACHE_TTL_MS) {
    const cidrs = await loadCidrs();
    cache = { cidrs, loadedAt: now };
  }
  // Empty allowlist = no restriction (allow all)
  if (cache.cidrs.length === 0) return true;
  return cache.cidrs.some((cidr) => ipMatches(ip, cidr));
}

/** Force-clear the cache after a CRUD change to the allowlist table. */
export function invalidateIpGuardCache(): void {
  cache = null;
}
