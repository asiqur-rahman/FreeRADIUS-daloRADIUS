// Typed wrappers around the API endpoints used by the dashboards.
// Each call accepts the auth token explicitly so the data layer
// stays decoupled from React context.
import type {
  AdminDeviceSummary,
  CreateGroupAttributeRequest,
  CreateGroupRequest,
  CreateNasRequest,
  CreateUserRequest,
  CreateDeviceRequest,
  AuthenticationEvent,
  AuditLogEntry,
  DeviceApprovalEntry,
  DeviceDecisionRequest,
  SessionDisconnectResponse,
  EapCertificate,
  GroupSummary,
  NasClient,
  Paginated,
  RadiusSession,
  OperationsOverview,
  MfaSetupResponse,
  MfaStatus,
  Site,
  UpdateDeviceRequest,
  UserDevice,
  UserSummary,
  UpdateUserRequest,
} from "@app/shared";
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
  return api<NasClient>(`${v1}/admin/nas`, { method: "POST", token, body });
}
export function updateNas(token: string, id: string, body: Partial<CreateNasRequest>) {
  return api<NasClient>(`${v1}/admin/nas/${id}`, { method: "PATCH", token, body });
}
export function deleteNas(token: string, id: string) {
  return api<{ ok: true }>(`${v1}/admin/nas/${id}`, { method: "DELETE", token });
}
export function rotateNasSecret(token: string, id: string) {
  return api<{ id: string; nasname: string; newSecret: string }>(
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
