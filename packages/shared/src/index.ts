// ─────────────────────────────────────────────────────────────────────
//  Shared types between apps/api and apps/web.
//
//  Keep this module dependency-free — it is consumed by Node and the
//  browser. No Prisma imports, no Fastify imports, no DOM imports.
// ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export type UserStatus = "pending" | "active" | "suspended" | "expired";

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  validFrom: string | null;
  validUntil: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  groups: Array<{ id: string; name: string }>;
}

export interface LoginRequest {
  username: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserSummary;
  mfaRequired?: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  fullName?: string;
  password: string;
  role?: UserRole;
  groupIds?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface UpdateUserRequest {
  email?: string;
  fullName?: string;
  status?: UserStatus;
  role?: UserRole;
  validFrom?: string | null;
  validUntil?: string | null;
  groupIds?: string[];
}

// ── Groups & policy ──────────────────────────────────────────────────

export interface GroupAttribute {
  id: string;
  attribute: string;
  op: string;
  value: string;
  kind: "check" | "reply";
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  attributes: GroupAttribute[];
  _count?: { members: number };
}

// ── NAS clients ──────────────────────────────────────────────────────

export type NasVendor = "cisco" | "aruba" | "ubiquiti" | "mikrotik" | "meraki" | "other";

export interface NasClient {
  id: string;
  nasname: string;
  shortname: string;
  secret: string;
  type: NasVendor;
  description: string | null;
  enabled: boolean;
  coaPort: number;
  siteId: string | null;
  site?: { id: string; name: string; region: string | null } | null;
  createdAt: string;
  updatedAt: string;
  /** Present only on the immediate create response. One-time display. */
  _generatedSecret?: string;
}

export interface CreateNasRequest {
  nasname: string;
  shortname: string;
  secret?: string;
  type?: NasVendor;
  description?: string | null;
  enabled?: boolean;
  coaPort?: number;
  siteId?: string | null;
}

// ── Sites ────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  region: string | null;
  address: string | null;
  _count?: { nasClients: number };
}

// ── EAP certificate inventory ────────────────────────────────────────

export type CertSeverity = "ok" | "warn-60" | "warn-30" | "critical-7" | "expired";

export interface EapCertificate {
  id: string;
  subject: string;
  issuer: string | null;
  fingerprint: string;
  serial: string | null;
  issuedAt: string;
  expiresAt: string;
  isActive: boolean;
  notes: string | null;
  daysUntilExpiry: number;
  severity: CertSeverity;
}
