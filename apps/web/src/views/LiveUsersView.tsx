import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Search, ShieldCheck, Smartphone } from "lucide-react";
import type { GroupSummary, UserSummary } from "@app/shared";
import { CreateUserDrawer } from "../components/CreateUserDrawer";
import { PageHelp } from "../components/PageHelp";
import { UserEditDrawer } from "../components/UserEditDrawer";
import { useAuth } from "../auth/AuthContext";
import { listGroups, listUsers } from "../api/endpoints";

function statusClass(status: UserSummary["status"]) {
  if (status === "active") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (status === "suspended") return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  if (status === "expired") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export function LiveUsersView() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<UserSummary | null>(null);

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

        <div className="mt-4 space-y-4 lg:hidden">
          {users.map((user) => (
            <div key={user.id} className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold tracking-tight text-white">
                    {user.fullName || user.username}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {user.username}
                    {user.email ? ` · ${user.email}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => setEditTarget(user)}
                  className="rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Edit
                </button>
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

              <div className="mt-4 grid gap-3 text-sm text-slate-500">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                    Groups
                  </div>
                  <div className="mt-2 text-slate-300">
                    {user.groups.map((group) => group.name).join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                    Devices
                  </div>
                  <div className="mt-2 space-y-2">
                    {user.devices.length === 0 ? (
                      <div className="text-slate-500">No bound devices</div>
                    ) : (
                      user.devices.map((device) => (
                        <div key={device.id} className="flex items-center gap-2 text-sm">
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
                          {device.label && <span className="text-slate-500">({device.label})</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {user.validUntil && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Expires {new Date(user.validUntil).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
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
                    <button
                      onClick={() => setEditTarget(user)}
                      className="rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
