// ─────────────────────────────────────────────────────────────────────
//  Shared types between apps/api and apps/web.
//
//  Keep this module dependency-free — it is consumed by Node and the
//  browser. No Prisma imports, no Fastify imports, no DOM imports.
// ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export type UserStatus = "pending" | "active" | "suspended" | "expired";

export type DeviceStatus = "pending" | "approved" | "rejected";

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
  devices: Array<{ id: string; mac: string; label: string | null; status: DeviceStatus }>;
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
  username?: string;
  email?: string;
  fullName?: string | null;
  status?: UserStatus;
  role?: UserRole;
  validFrom?: string | null;
  validUntil?: string | null;
  groupIds?: string[];
  newPassword?: string;
}

// ── Groups & policy ──────────────────────────────────────────────────

export interface GroupAttribute {
  id: string;
  attribute: string;
  op: string;
  value: string;
  kind: "check" | "reply";
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface CreateGroupAttributeRequest {
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

// -- Devices and accounting sessions ----------------------------------------

export interface UserDevice {
  id: string;
  mac: string;
  label: string | null;
  isPrimary: boolean;
  certFingerprint: string | null;
  learnedAt: string;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  status: DeviceStatus;
}

export interface CreateDeviceRequest {
  mac: string;
  label?: string | null;
  currentPassword: string;
}

export interface UpdateDeviceRequest {
  label?: string | null;
  isPrimary?: boolean;
}

export interface AdminDeviceSummary extends UserDevice {
  userId: string;
  username: string;
  fullName: string | null;
  email: string;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNotes: string | null;
}

export interface DeviceDecisionRequest {
  status: Exclude<DeviceStatus, "pending">;
  notes?: string | null;
}

export interface DeviceCertificateSummary {
  fingerprint: string;
  subject: string;
  issuer: string | null;
  serial: string | null;
  commonName: string | null;
  sanEmail: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface DeviceCertificateImportRequest {
  pem: string;
  approve?: boolean;
  notes?: string | null;
}

export interface GenerateDeviceCertificateRequest {
  commonName?: string | null;
  sanEmail?: string | null;
  pkcs12Password?: string | null;
  approve?: boolean;
  notes?: string | null;
}

export interface DeviceCertificateMutationResponse {
  ok: true;
  device: AdminDeviceSummary;
  certificate: DeviceCertificateSummary | null;
  approvalChanged: boolean;
  disconnectedSessions: number;
}

export interface DeviceCertificateImportResponse extends DeviceCertificateMutationResponse {
  alreadyBound: boolean;
}

export interface DeviceCertificateBundleResponse extends DeviceCertificateImportResponse {
  certificatePem: string;
  privateKeyPem: string;
  pkcs12Base64: string;
  pkcs12Password: string;
}

export interface DeviceCertificateClearResponse extends DeviceCertificateMutationResponse {
  alreadyCleared: boolean;
}

export interface DeviceApprovalEntry {
  id: string;
  deviceId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string;
  mac: string;
  deviceLabel: string | null;
  status: DeviceStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  notes: string | null;
}

export interface RadiusSession {
  id: string;
  acctSessionId: string;
  username: string;
  nasIp: string;
  nasName: string | null;
  siteName: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  stoppedAt: string | null;
  durationSeconds: string;
  inputOctets: string;
  outputOctets: string;
  callingStationId: string;
  calledStationId: string;
  framedIpAddress: string | null;
  terminateCause: string;
  deviceLabel: string | null;
}

export interface CoaResult {
  sent: boolean;
  acknowledged: boolean;
  outcome: "ack" | "nack" | "timeout" | "invalid_response" | "not_configured" | "send_error";
  message: string;
}

export interface SessionDisconnectResponse {
  ok: boolean;
  sessionId: string;
  result: CoaResult;
}

// -- Operations and observability -------------------------------------------

export type AlertSeverity = "critical" | "warning" | "info";

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  observedAt: string;
}

export interface OperationsOverview {
  activeUsers: number;
  activeSessions: number;
  enabledNas: number;
  totalNas: number;
  authSuccessRate24h: number | null;
  authenticationTrend: Array<{ hour: string; accepts: number; rejects: number }>;
  sessionsBySite: Array<{ site: string; sessions: number }>;
  rejectReasons: Array<{ reason: string; count: number }>;
  alerts: OperationalAlert[];
}

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuthenticationEvent {
  id: string;
  username: string;
  type: string;
  source: string;
  metadata: unknown;
  createdAt: string;
}

export interface MfaStatus {
  enabled: boolean;
  pendingEnrollment: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
}

// ── User-level client certificates (EAP-TLS) ─────────────────────────

export interface UserClientCert {
  id: string;
  fingerprint: string;
  commonName: string;
  expiresAt: string;
  revokedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ProvisionUserCertRequest {
  notes?: string | null;
  pkcs12Password?: string | null;
}

export interface ProvisionUserCertResponse {
  fingerprint: string;
  commonName: string;
  expiresAt: string;
  certificatePem: string;
  privateKeyPem: string;
  pkcs12Base64: string;
  pkcs12Password: string;
}

// ── Platform settings ────────────────────────────────────────────────

export type CaSource = "db" | "env" | "auto";

export interface CaInfo {
  configured:  boolean;
  source:      CaSource | null;
  subject:     string | null;
  issuer:      string | null;
  expiresAt:   string | null;
  fingerprint: string | null;
}

export interface PlatformSettingsResponse {
  telegram: {
    botToken:    string | null;
    adminChatId: string | null;
    configured:  boolean;
  };
  ca: CaInfo;
}

export interface UpdateCaRequest {
  certPem?:       string;
  keyPem?:        string;
  keyPassphrase?: string | null;
  regenerate?:    boolean;
}
