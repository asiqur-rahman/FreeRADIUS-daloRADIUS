// Typed wrappers around the API endpoints used by the dashboards.
// Each call accepts the auth token explicitly so the data layer
// stays decoupled from React context.
import type {
  CreateNasRequest,
  EapCertificate,
  GroupSummary,
  NasClient,
  Paginated,
  Site,
  UserSummary,
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

// ── Groups ───────────────────────────────────────────────────────────
export function listGroups(token: string) {
  return api<GroupSummary[]>(`${v1}/admin/groups`, { token });
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
