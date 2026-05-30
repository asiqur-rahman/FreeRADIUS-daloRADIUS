import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { AdminDeviceSummary, GroupSummary, UserSummary } from "@app/shared";
import { ApiCallError } from "../api/client";
import { CreateUserDrawer } from "../components/CreateUserDrawer";
import { PageHelp } from "../components/PageHelp";
import { UserEditDrawer } from "../components/UserEditDrawer";
import { useAuth } from "../auth/AuthContext";
import {
  deleteAdminDevice,
  listGroups,
  listUserDevicesForAdmin,
  listUsers,
} from "../api/endpoints";

function statusClass(status: UserSummary["status"]) {
  if (status === "active") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (status === "suspended") return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  if (status === "expired") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function initialsFor(user: UserSummary) {
  const source = user.fullName || user.username;
  return source
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function LiveUsersView() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<UserSummary | null>(null);
  const [devicesUser, setDevicesUser] = useState<UserSummary | null>(null);

  const load = useCallback(async () => {
    if (!token) return;

    const [userResult, groupResult] = await Promise.all([
      listUsers(token, { pageSize: 100, q: query || undefined }),
      listGroups(token),
    ]);

    setUsers(userResult.items);
    setGroups(groupResult);
  }, [query, token]);

  useEffect(() => {
    void load().catch((err: Error) => setMessage(err.message));
  }, [load]);

  const handleCreated = (created: UserSummary) => {
    setUsers((previous) => [created, ...previous]);
    setShowAdd(false);
    setMessage(`User ${created.username} created successfully.`);
  };

  const handleSaved = (updated: UserSummary) => {
    setUsers((previous) => previous.map((user) => (user.id === updated.id ? updated : user)));
    setEditTarget(null);
    setMessage(`Saved changes for ${updated.username}.`);
  };

  return (
    <div className="space-y-5">
      {editTarget && (
        <UserEditDrawer
          user={editTarget}
          groups={groups}
          token={token!}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="theme-text-primary text-xl font-semibold tracking-tight lg:text-2xl">
              Users
            </h2>
            <PageHelp
              title="User Management"
              description="Create and manage Wi-Fi user accounts. Each user is assigned to policy groups that determine RADIUS behavior and network access."
              tips={[
                "Users authenticate with PEAP-MSCHAPv2 or EAP-TLS depending on your rollout model",
                "Group membership drives reply attributes and VLAN policy immediately",
                "Suspending or deleting a user can trigger session disconnects on active devices",
              ]}
            />
          </div>
          <p className="theme-text-muted mt-1 text-sm">{users.length} records displayed</p>
        </div>

        <button
          onClick={() => setShowAdd((current) => !current)}
          className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105"
        >
          <Plus className="h-4 w-4" />
          New user
        </button>
      </div>

      {message && (
        <div
          className={`rounded-[24px] border px-4 py-4 text-sm ${
            message.toLowerCase().includes("fail") ||
            message.toLowerCase().includes("error") ||
            message.toLowerCase().includes("unable")
              ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message}
        </div>
      )}

      {showAdd && (
        <CreateUserDrawer
          groups={groups}
          token={token!}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      <div className="app-card-dark overflow-hidden p-4">
        <div className="border-b border-white/6 pb-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              className="w-full rounded-[20px] border border-white/8 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
            />
          </div>
        </div>

        <div className="mt-4 lg:hidden">
          {users.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
              No users found.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[26px] border border-white/6 bg-white/[0.03]">
              {users.map((user, index) => {
                const approvedDevices = user.devices.filter((device) => device.status === "approved").length;
                const groupSummary = user.groups.length === 0
                  ? "No group"
                  : user.groups.map((group) => group.name).join(", ");

                return (
                  <div
                    key={user.id}
                    className={`px-4 py-4 ${index !== users.length - 1 ? "border-b border-white/6" : ""}`}
                  >
                    <button
                      onClick={() => setEditTarget(user)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-400/18 to-teal-400/18 text-sky-200">
                        {initialsFor(user) ? (
                          <span className="text-sm font-semibold tracking-[0.08em]">
                            {initialsFor(user)}
                          </span>
                        ) : (
                          <UserRound className="h-4.5 w-4.5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold tracking-tight text-white">
                              {user.fullName || user.username}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              @{user.username}
                              {user.email ? ` · ${user.email}` : ""}
                            </div>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusClass(user.status)}`}>
                            {user.status}
                          </span>
                          {user.mfaEnabled && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              MFA
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                            <Smartphone className={`h-3.5 w-3.5 ${approvedDevices > 0 ? "text-emerald-300" : "text-slate-500"}`} />
                            {approvedDevices} device{approvedDevices === 1 ? "" : "s"}
                          </span>
                          <span className="inline-flex rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                            {groupSummary}
                          </span>
                        </div>

                        {user.validUntil && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                            <CalendarClock className="h-3.5 w-3.5" />
                            Expires {new Date(user.validUntil).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="mt-3 flex items-center gap-2 pl-[3.75rem]">
                      <button
                        onClick={() => setDevicesUser(user)}
                        className="inline-flex items-center gap-1.5 rounded-[16px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Devices
                      </button>
                      <button
                        onClick={() => setEditTarget(user)}
                        className="rounded-[16px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Groups</th>
                <th className="px-4 py-3 font-medium">Devices</th>
                <th className="px-4 py-3 font-medium">MFA</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {users.map((user) => (
                <tr key={user.id} className="align-top transition hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-white">{user.fullName || user.username}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {user.username}
                      {user.email ? ` / ${user.email}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {user.groups.map((group) => group.name).join(", ") || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    {user.devices.length === 0 ? (
                      <span className="text-xs text-slate-500">None</span>
                    ) : (
                      <div className="space-y-2">
                        {user.devices.map((device) => (
                          <div key={device.id} className="flex items-center gap-2">
                            <Smartphone
                              className={`h-4 w-4 ${
                                device.status === "approved"
                                  ? "text-emerald-300"
                                  : device.status === "rejected"
                                    ? "text-rose-300"
                                    : "text-amber-300"
                              }`}
                            />
                            <span className="font-mono text-xs uppercase tracking-wide text-slate-400">
                              {device.mac}
                            </span>
                            {device.label && <span className="text-xs text-slate-500">({device.label})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {user.mfaEnabled ? (
                      <ShieldCheck className="h-4.5 w-4.5 text-emerald-300" />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusClass(user.status)}`}>
                      {user.status}
                    </span>
                    {user.validUntil && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Expires {new Date(user.validUntil).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setDevicesUser(user)}
                        className="inline-flex items-center gap-1.5 rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Devices
                      </button>
                      <button
                        onClick={() => setEditTarget(user)}
                        className="rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {devicesUser && (
        <UserDevicesModal
          user={devicesUser}
          token={token!}
          onClose={() => setDevicesUser(null)}
          onDelete={(deviceId) => {
            setDevicesUser((current) =>
              current
                ? { ...current, devices: current.devices.filter((device) => device.id !== deviceId) }
                : current,
            );
            setUsers((current) =>
              current.map((user) =>
                user.id === devicesUser.id
                  ? { ...user, devices: user.devices.filter((device) => device.id !== deviceId) }
                  : user,
              ),
            );
          }}
        />
      )}
    </div>
  );
}

function UserDevicesModal({
  user,
  token,
  onClose,
  onDelete,
}: {
  user: UserSummary;
  token: string;
  onClose: () => void;
  onDelete: (deviceId: string) => void;
}) {
  const [devices, setDevices] = useState<AdminDeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    void listUserDevicesForAdmin(token, user.id, { pageSize: 100 })
      .then((result) => setDevices(result.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load devices"))
      .finally(() => setLoading(false));
  }, [token, user.id]);

  const handleDelete = async (deviceId: string) => {
    setDeletingId(deviceId);
    setError(null);

    try {
      await deleteAdminDevice(token, deviceId);
      setDevices((current) => current.filter((device) => device.id !== deviceId));
      onDelete(deviceId);
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Failed to delete device");
    } finally {
      setDeletingId(null);
    }
  };

  const statusDot: Record<string, string> = {
    approved: "bg-emerald-400",
    pending: "bg-amber-400",
    rejected: "bg-rose-400",
    blocked: "bg-slate-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="surface-dark-strong w-full rounded-t-[32px] border-x-0 border-b-0 px-4 pb-5 pt-4 sm:max-w-xl sm:rounded-[32px] sm:border sm:px-5 safe-bottom">
        <div className="flex items-center justify-between border-b border-white/6 pb-4">
          <div>
            <div className="text-base font-semibold text-white">{user.fullName || user.username}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              {user.username} · {devices.length} device{devices.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {loading && (
            <div className="py-8 text-center text-sm text-slate-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && devices.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-white/8 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
              No devices registered for this user.
            </div>
          )}

          {devices.map((device) => (
            <div key={device.id} className="rounded-[20px] border border-white/6 bg-white/[0.03] px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-slate-300">
                  <Smartphone className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{device.label || "Unnamed device"}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                        device.status === "approved"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : device.status === "blocked"
                            ? "border-slate-500/20 bg-slate-500/10 text-slate-300"
                            : device.status === "rejected"
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                              : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[device.status] ?? "bg-slate-400"}`} />
                      {device.status}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs uppercase tracking-wide text-slate-500">{device.mac}</div>
                  {device.lastIp && <div className="mt-0.5 text-xs text-slate-600">IP: {device.lastIp}</div>}
                  <div className="mt-0.5 text-xs text-slate-600">
                    {device.manufacturer ?? device.deviceType} · Last seen{" "}
                    {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString() : "—"}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {confirmId === device.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => void handleDelete(device.id)}
                        disabled={deletingId === device.id}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                      >
                        {deletingId === device.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg border border-white/8 px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.06]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(device.id)}
                      title="Delete this device record"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-slate-600">
          Deleting a device removes its record. The device will show up as new again on next connection and must be re-approved.
        </p>
      </div>
    </div>
  );
}
