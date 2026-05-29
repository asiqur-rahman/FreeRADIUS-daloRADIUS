// Typed wrappers around the API endpoints used by the dashboards.
// Each call accepts the auth token explicitly so the data layer
// stays decoupled from React context.
import type {
  AdminDeviceSummary,
  CaInfo,
  CertSubjectSettings,
  CreateGroupAttributeRequest,
  CreateGroupRequest,
  CreateNasRequest,
  CreateUserRequest,
  CreateDeviceRequest,
  AuthenticationEvent,
  AuditLogEntry,
  DeviceApprovalEntry,
  DeviceDecisionRequest,
  FreeRadiusReloadResult,
  SessionDisconnectResponse,
  EapCertificate,
  GroupSummary,
  NasClient,
  Paginated,
  PlatformSettingsResponse,
  RadiusSession,
  OperationsOverview,
  MfaSetupResponse,
  MfaStatus,
  MyCertsResponse,
  ProvisionUserCertRequest,
  ProvisionUserCertResponse,
  Site,
  UpdateCaRequest,
  UpdateCertSettingsRequest,
  UpdateDeviceRequest,
  UserClientCert,
  UserDevice,
  UserSummary,
  UpdateUserRequest,
} from "@app/shared";
export type { CaInfo, CertSubjectSettings, FreeRadiusReloadResult, PlatformSettingsResponse };

// Convenience: NAS mutation responses include an optional auto-reload result.
type WithReload<T> = T & { _reload?: FreeRadiusReloadResult };
import { api } from "./client";

const v1 = "/api/v1";

// ── Users ────────────────────────────────────────────────────────────
export function listUsers(token: string, q?: { page?: number; pageSize?: number; q?: string }) {
  const params = new URLSearchParams();
  if (q?.page) params.set("page", String(q.page));
  if (q?.pageSize) params.set("pageSize", String(q.pageSize));
  if (q?.q) params.set("q", q.q);
  const qs = params.toString();
  return api<Paginated<UserSummary>>(`${v1}/admin/users${qs ? `?${qs}` : ""}`, { token });
}
export function createUser(token: string, body: CreateUserRequest) {
  return api<UserSummary>(`${v1}/admin/users`, { method: "POST", token, body });
}
export function updateUser(token: string, id: string, body: UpdateUserRequest) {
  return api<UserSummary>(`${v1}/admin/users/${id}`, { method: "PATCH", token, body });
}
export function deleteUser(token: string, id: string) {
  return api<{ ok: true }>(`${v1}/admin/users/${id}`, { method: "DELETE", token });
}
// ── Self-service certs (user portal) ─────────────────────────────────
export function listMyCerts(token: string) {
  return api<MyCertsResponse>(`${v1}/me/certs`, { token });
}
export function provisionMyCert(token: string, body: ProvisionUserCertRequest) {
  return api<ProvisionUserCertResponse>(`${v1}/me/certs/provision`, {
    method: "POST", token, body,
  });
}
export function revokeMyCert(token: string, certId: string) {
  return api<{ ok: boolean }>(`${v1}/me/certs/${certId}`, { method: "DELETE", token });
}

// ── Admin: user client certs (EAP-TLS) ───────────────────────────────
export function listUserCerts(token: string, userId: string) {
  return api<UserClientCert[]>(`${v1}/admin/users/${userId}/certs`, { token });
}
export function provisionUserCert(token: string, userId: string, body: ProvisionUserCertRequest) {
  return api<ProvisionUserCertResponse>(`${v1}/admin/users/${userId}/provision-cert`, {
    method: "POST", token, body,
  });
}
export function revokeUserCert(token: string, userId: string, certId: string) {
  return api<{ ok: boolean }>(`${v1}/admin/users/${userId}/certs/${certId}`, {
    method: "DELETE", token,
  });
}

// ── Groups ───────────────────────────────────────────────────────────
export function listGroups(token: string) {
  return api<GroupSummary[]>(`${v1}/admin/groups`, { token });
}
export function createGroup(token: string, body: CreateGroupRequest) {
  return api<GroupSummary>(`${v1}/admin/groups`, { method: "POST", token, body });
}
export function createGroupAttribute(token: string, id: string, body: CreateGroupAttributeRequest) {
  return api<GroupSummary["attributes"][number]>(`${v1}/admin/groups/${id}/attributes`, { method: "POST", token, body });
}
export function deleteGroupAttribute(token: string, id: string, attrId: string) {
  return api<{ ok: true }>(`${v1}/admin/groups/${id}/attributes/${attrId}`, { method: "DELETE", token });
}

// ── NAS ──────────────────────────────────────────────────────────────
export function listNas(token: string) {
  return api<Paginated<NasClient>>(`${v1}/admin/nas?pageSize=100`, { token });
}
export function createNas(token: string, body: CreateNasRequest) {
  return api<WithReload<NasClient>>(`${v1}/admin/nas`, { method: "POST", token, body });
}
export function updateNas(token: string, id: string, body: Partial<CreateNasRequest>) {
  return api<WithReload<NasClient>>(`${v1}/admin/nas/${id}`, { method: "PATCH", token, body });
}
export function deleteNas(token: string, id: string) {
  return api<WithReload<{ ok: true }>>(`${v1}/admin/nas/${id}`, { method: "DELETE", token });
}
export function rotateNasSecret(token: string, id: string) {
  return api<WithReload<{ id: string; nasname: string; newSecret: string }>>(
    `${v1}/admin/nas/${id}/rotate-secret`,
    { method: "POST", token },
  );
}

// ── Sites ────────────────────────────────────────────────────────────
export function listSites(token: string) {
  return api<Site[]>(`${v1}/admin/sites`, { token });
}

// ── EAP certs ────────────────────────────────────────────────────────
export function listCerts(token: string) {
  return api<EapCertificate[]>(`${v1}/admin/certs`, { token });
}
export function addCert(token: string, body: { pem: string; activate?: boolean; notes?: string | null }) {
  return api<EapCertificate>(`${v1}/admin/certs`, { method: "POST", token, body });
}
export function activateCert(token: string, id: string) {
  return api<EapCertificate>(`${v1}/admin/certs/${id}/activate`, { method: "POST", token });
}
export function deleteCert(token: string, id: string) {
  return api<{ ok: true }>(`${v1}/admin/certs/${id}`, { method: "DELETE", token });
}

// -- Device approvals -------------------------------------------------------
export function listAdminDevices(
  token: string,
  q?: { status?: "pending" | "approved" | "rejected"; userId?: string; search?: string; page?: number; pageSize?: number },
) {
  const params = new URLSearchParams();
  if (q?.status) params.set("status", q.status);
  if (q?.userId) params.set("userId", q.userId);
  if (q?.search) params.set("search", q.search);
  if (q?.page) params.set("page", String(q.page));
  if (q?.pageSize) params.set("pageSize", String(q.pageSize));
  const qs = params.toString();
  return api<Paginated<AdminDeviceSummary>>(`${v1}/admin/devices${qs ? `?${qs}` : ""}`, { token });
}
export function listUserDevicesForAdmin(token: string, userId: string, q?: { status?: "pending" | "approved" | "rejected"; search?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (q?.status) params.set("status", q.status);
  if (q?.search) params.set("search", q.search);
  if (q?.page) params.set("page", String(q.page));
  if (q?.pageSize) params.set("pageSize", String(q.pageSize));
  const qs = params.toString();
  return api<Paginated<AdminDeviceSummary>>(`${v1}/admin/users/${userId}/devices${qs ? `?${qs}` : ""}`, { token });
}
export function decideAdminDevice(token: string, id: string, body: DeviceDecisionRequest) {
  return api<{
    ok: true;
    alreadyApplied: boolean;
    disconnectedSessions: number;
    disconnectAttempts: Array<{ sessionId: string; result: SessionDisconnectResponse["result"] }>;
    device: AdminDeviceSummary;
  }>(`${v1}/admin/devices/${id}`, { method: "PATCH", token, body });
}
export function listDeviceApprovals(
  token: string,
  q?: { status?: "pending" | "approved" | "rejected"; userId?: string; search?: string; page?: number; pageSize?: number },
) {
  const params = new URLSearchParams();
  if (q?.status) params.set("status", q.status);
  if (q?.userId) params.set("userId", q.userId);
  if (q?.search) params.set("search", q.search);
  if (q?.page) params.set("page", String(q.page));
  if (q?.pageSize) params.set("pageSize", String(q.pageSize));
  const qs = params.toString();
  return api<Paginated<DeviceApprovalEntry>>(`${v1}/admin/approvals${qs ? `?${qs}` : ""}`, { token });
}
// -- Self-service devices ----------------------------------------------------
export function listMyDevices(token: string) {
  return api<UserDevice[]>(`${v1}/me/devices`, { token });
}
export function createMyDevice(token: string, body: CreateDeviceRequest) {
  return api<UserDevice>(`${v1}/me/devices`, { method: "POST", token, body });
}
export function updateMyDevice(token: string, id: string, body: UpdateDeviceRequest) {
  return api<UserDevice>(`${v1}/me/devices/${id}`, { method: "PATCH", token, body });
}
export function deleteMyDevice(token: string, id: string, currentPassword: string) {
  return api<{ ok: true }>(`${v1}/me/devices/${id}`, {
    method: "DELETE",
    token,
    body: { currentPassword },
  });
}
export function listMySessions(token: string) {
  return api<Paginated<RadiusSession>>(`${v1}/me/sessions`, { token });
}

// -- Accounting sessions and CoA --------------------------------------------
export function listAdminSessions(token: string, q?: { active?: boolean; q?: string }) {
  const params = new URLSearchParams();
  if (q?.active !== undefined) params.set("active", String(q.active));
  if (q?.q) params.set("q", q.q);
  const qs = params.toString();
  return api<Paginated<RadiusSession>>(`${v1}/admin/sessions${qs ? `?${qs}` : ""}`, { token });
}
export function disconnectAdminSession(token: string, id: string, reason?: string) {
  return api<SessionDisconnectResponse>(`${v1}/admin/sessions/${id}/disconnect`, {
    method: "POST",
    token,
    body: reason ? { reason } : {},
  });
}

// -- Operations and observability -------------------------------------------
export function getOperationsOverview(token: string) {
  return api<OperationsOverview>(`${v1}/admin/operations/overview`, { token });
}
export function listAuditLogs(token: string, pageSize = 50) {
  return api<Paginated<AuditLogEntry>>(`${v1}/admin/audit-logs?pageSize=${pageSize}`, { token });
}
export function listAuthenticationEvents(token: string, pageSize = 50) {
  return api<Paginated<AuthenticationEvent>>(`${v1}/admin/auth-events?pageSize=${pageSize}`, { token });
}

// -- RADIUS IP allowlist -----------------------------------------------------
export interface RadiusAllowedIp {
  id: string;
  cidr: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
}

export function listRadiusAllowlist(token: string) {
  return api<RadiusAllowedIp[]>(`${v1}/admin/radius-allowlist`, { token });
}
export function createRadiusAllowedIp(
  token: string,
  body: { cidr: string; label?: string; enabled?: boolean },
) {
  return api<RadiusAllowedIp>(`${v1}/admin/radius-allowlist`, { method: "POST", token, body });
}
export function updateRadiusAllowedIp(
  token: string,
  id: string,
  body: { label?: string; enabled?: boolean },
) {
  return api<RadiusAllowedIp>(`${v1}/admin/radius-allowlist/${id}`, { method: "PATCH", token, body });
}
export function deleteRadiusAllowedIp(token: string, id: string) {
  return api<void>(`${v1}/admin/radius-allowlist/${id}`, { method: "DELETE", token });
}

// -- Platform settings -------------------------------------------------------
export function getPlatformSettings(token: string) {
  return api<PlatformSettingsResponse>(`${v1}/admin/settings/platform`, { token });
}

export function updatePlatformSettings(
  token: string,
  body: {
    telegram?: { botToken?: string | null; adminChatId?: string | null };
    ca?: UpdateCaRequest;
    certSettings?: UpdateCertSettingsRequest;
    freeradius?: { reloadCommand?: string | null };
  },
) {
  return api<PlatformSettingsResponse>(`${v1}/admin/settings/platform`, {
    method: "PUT",
    token,
    body,
  });
}

// ── FreeRADIUS management ─────────────────────────────────────────────
export function triggerFreeRadiusReload(token: string) {
  return api<FreeRadiusReloadResult>(`${v1}/admin/freeradius/reload`, { method: "POST", token });
}
export function getFreeRadiusConfig(token: string) {
  return api<{ reloadCommand: string | null; configured: boolean }>(`${v1}/admin/freeradius/config`, { token });
}
export function saveFreeRadiusConfig(token: string, body: { reloadCommand?: string | null }) {
  return api<{ reloadCommand: string | null; configured: boolean }>(`${v1}/admin/freeradius/config`, {
    method: "PUT", token, body,
  });
}

// ── LDAP settings ────────────────────────────────────────────────────

export interface LdapSettingsResponse {
  url: string;
  bindDn: string;
  bindPassword: string;
  userBaseDn: string;
  userFilter: string;
  groupBaseDn: string;
  groupFilter: string;
  attrUsername: string;
  attrEmail: string;
  attrFullname: string;
  attrGroupName: string;
}

export function getLdapSettings(token: string) {
  return api<LdapSettingsResponse>(`${v1}/admin/ldap/settings`, { token });
}
export function saveLdapSettings(token: string, body: Partial<LdapSettingsResponse>) {
  return api<{ ok: boolean }>(`${v1}/admin/ldap/settings`, { method: "PUT", token, body });
}
export function testLdapConnection(token: string) {
  return api<{ ok: boolean; error?: string }>(`${v1}/admin/ldap/test`, { method: "POST", token, body: {} });
}
export function runLdapSync(token: string) {
  return api<{
    usersFound: number; usersCreated: number; usersSkipped: number;
    groupsCreated: number; membershipsAdded: number; errors: string[];
  }>(`${v1}/admin/ldap/sync`, { method: "POST", token, body: {} });
}

// ── SAML settings ────────────────────────────────────────────────────

export interface SamlSettingsResponse {
  enabled: boolean;
  entryPoint: string;
  issuer: string;
  cert: string;
  spCert: string;
  spKey: string;
  nameIdFormat: string;
  attrUsername: string;
  attrEmail: string;
  attrFullname: string;
}

export function getSamlSettings(token: string) {
  return api<SamlSettingsResponse>(`${v1}/saml/settings`, { token });
}
export function saveSamlSettings(token: string, body: Partial<SamlSettingsResponse>) {
  return api<{ ok: boolean }>(`${v1}/saml/settings`, { method: "PUT", token, body });
}

// -- Account security --------------------------------------------------------
export function changeMyPassword(token: string, body: { currentPassword: string; newPassword: string }) {
  return api<{ ok: true }>(`${v1}/me/password`, { method: "POST", token, body });
}
export function getMfaStatus(token: string) {
  return api<MfaStatus>(`${v1}/me/mfa`, { token });
}
export function setupMfa(token: string, currentPassword: string) {
  return api<MfaSetupResponse>(`${v1}/me/mfa/setup`, { method: "POST", token, body: { currentPassword } });
}
export function enableMfa(token: string, code: string) {
  return api<MfaStatus>(`${v1}/me/mfa/enable`, { method: "POST", token, body: { code } });
}
export function disableMfa(token: string, currentPassword: string, code?: string) {
  return api<MfaStatus>(`${v1}/me/mfa`, { method: "DELETE", token, body: { currentPassword, code } });
}
