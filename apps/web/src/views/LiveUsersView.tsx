import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Search, ShieldCheck, Smartphone } from "lucide-react";
import type { GroupSummary, UserSummary } from "@app/shared";
import { listGroups, listUsers } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";
import { UserEditDrawer } from "../components/UserEditDrawer";
import { CreateUserDrawer } from "../components/CreateUserDrawer";

export function LiveUsersView() {
  const { token } = useAuth();
  const [users, setUsers]   = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery]   = useState("");
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
    setUsers((prev) => [created, ...prev]);
    setShowAdd(false);
    setMessage(`User ${created.username} created successfully.`);
  };

  const handleSaved = (updated: UserSummary) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setEditTarget(null);
    setMessage(`Saved changes for ${updated.username}`);
  };

  return (
    <div className="space-y-4">
      {/* ── Edit drawer ── */}
      {editTarget && (
        <UserEditDrawer
          user={editTarget}
          groups={groups}
          token={token!}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Users</h2>
            <PageHelp
              title="User Management"
              description="Create and manage WiFi user accounts. Each user is assigned to policy groups that determine their session and bandwidth policy. The password hash and NT-hash are synced to FreeRADIUS immediately on every change."
              tips={[
                "Users authenticate via PEAP-MSCHAPv2 (username + password) or EAP-TLS (client certificate)",
                "Assigning a user to a group instantly pushes the RADIUS policy to radcheck and radusergroup tables",
                "Suspending or deleting a user triggers a CoA Disconnect-Request on any currently active session",
                "Click Edit on any row to open the full edit panel — change username, password, groups, expiry all in one place",
              ]}
            />
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} records displayed</p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />New User
        </button>
      </div>

      {message && (
        <div className={`border rounded-lg p-3 text-sm ${
          message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") || message.toLowerCase().includes("unable")
            ? "border-rose-900 bg-rose-950/20 text-rose-300"
            : "border-emerald-900 bg-emerald-950/20 text-emerald-300"
        }`}>
          {message}
        </div>
      )}

      {/* ── Create user drawer ── */}
      {showAdd && (
        <CreateUserDrawer
          groups={groups}
          token={token!}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {/* ── User table ── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl">
        <div className="p-3 border-b border-zinc-800">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
            />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Groups</th>
              <th className="px-4 py-3">Devices</th>
              <th className="px-4 py-3">MFA</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-zinc-100 font-medium">{user.fullName || user.username}</div>
                  <div className="text-xs text-zinc-500">{user.username} / {user.email}</div>
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  {user.groups.map((g) => g.name).join(", ") || <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  {user.devices.length === 0 ? (
                    <span className="text-zinc-600 text-xs">None</span>
                  ) : (
                    <div className="space-y-1">
                      {user.devices.map((d) => (
                        <div key={d.id} className="flex items-center gap-1.5">
                          <Smartphone
                            className={`w-3 h-3 shrink-0 ${
                              d.status === "approved" ? "text-emerald-400" :
                              d.status === "rejected" ? "text-rose-400" : "text-amber-400"
                            }`}
                          />
                          <span className="font-mono text-xs text-zinc-300">{d.mac}</span>
                          {d.label && <span className="text-xs text-zinc-500">({d.label})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.mfaEnabled
                    ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.status === "active"    ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800/50" :
                      user.status === "suspended" ? "bg-rose-900/40 text-rose-300 border border-rose-800/50" :
                      user.status === "expired"   ? "bg-amber-900/40 text-amber-300 border border-amber-800/50" :
                                                    "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {user.status}
                  </span>
                  {user.validUntil && (
                    <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      expires {new Date(user.validUntil).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditTarget(user)}
                    className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg border border-zinc-700 transition-colors"
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
  );
}
