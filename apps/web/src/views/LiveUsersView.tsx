import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Copy, Edit2, Eye, EyeOff, KeyRound, Plus, Search, ShieldCheck, Smartphone, X } from "lucide-react";
import type { GroupSummary, UserSummary } from "@app/shared";
import { createUser, listGroups, listUsers, resetUserPassword, updateUser } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LiveUsersView() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", fullName: "", password: "", groupId: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editTarget, setEditTarget] = useState<UserSummary | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [editExpiry, setEditExpiry] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [userResult, groupResult] = await Promise.all([listUsers(token, { pageSize: 100, q: query || undefined }), listGroups(token)]);
    setUsers(userResult.items);
    setGroups(groupResult);
  }, [query, token]);

  useEffect(() => {
    void load().catch((err: Error) => setMessage(err.message));
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createUser(token, {
        username: form.username,
        email: form.email,
        fullName: form.fullName || undefined,
        password: form.password,
        groupIds: form.groupId ? [form.groupId] : undefined,
      });
      setForm({ username: "", email: "", fullName: "", password: "", groupId: "" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create user");
    }
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !resetTarget) return;
    setResetBusy(true);
    try {
      await resetUserPassword(token, resetTarget.id, resetPwd);
      setResetDone(resetPwd);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setResetBusy(false);
    }
  };

  const closeReset = () => {
    setResetTarget(null);
    setResetPwd("");
    setResetDone(null);
    setShowPwd(false);
    setCopied(false);
  };

  const copyPwd = async (pwd: string) => {
    await navigator.clipboard.writeText(pwd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openEdit = (user: UserSummary) => {
    setEditTarget(user);
    setEditGroupIds(user.groups.map((g) => g.id));
    setEditExpiry(toLocalDatetimeValue(user.validUntil));
  };

  const toggleEditGroup = (gid: string) => {
    setEditGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid],
    );
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !editTarget) return;
    setEditBusy(true);
    try {
      await updateUser(token, editTarget.id, {
        groupIds: editGroupIds,
        validUntil: editExpiry ? new Date(editExpiry).toISOString() : null,
      });
      setEditTarget(null);
      setMessage(`Updated ${editTarget.username}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditBusy(false);
    }
  };

  const toggleStatus = async (user: UserSummary) => {
    if (!token) return;
    try {
      await updateUser(token, user.id, { status: user.status === "active" ? "suspended" : "active" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update user");
    }
  };

  return (
    <div className="space-y-4">
      {/* Edit user modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form onSubmit={submitEdit} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Edit — {editTarget.username}</div>
              <button type="button" onClick={() => setEditTarget(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {/* Groups */}
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Groups</div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editGroupIds.includes(g.id)}
                      onChange={() => toggleEditGroup(g.id)}
                      className="w-4 h-4 accent-indigo-500"
                    />
                    <span className="text-sm text-zinc-200">{g.name}</span>
                    {g.description && <span className="text-xs text-zinc-500 truncate">{g.description}</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Account expiry
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
                {editExpiry && (
                  <button type="button" onClick={() => setEditExpiry("")} className="text-zinc-500 hover:text-rose-400" title="Clear expiry">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-600 mt-1">Leave blank for no expiry. Account auto-suspends at this time.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
              <button type="submit" disabled={editBusy} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg">
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                {resetDone ? "Password updated" : `Reset password — ${resetTarget.username}`}
              </div>
              <button type="button" onClick={closeReset} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {resetDone ? (
              /* ── Success: show the new password once ── */
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">Copy and share this password with the user. It will not be shown again.</p>
                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
                  <span className="flex-1 font-mono text-sm text-white break-all">
                    {showPwd ? resetDone : "•".repeat(resetDone.length)}
                  </span>
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={() => copyPwd(resetDone)} className="text-zinc-500 hover:text-emerald-400 shrink-0">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={closeReset} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg">Done</button>
                </div>
              </div>
            ) : (
              /* ── Input form ── */
              <form onSubmit={submitReset} className="space-y-4">
                <div className="relative">
                  <input
                    required
                    minLength={10}
                    type={showPwd ? "text" : "password"}
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value)}
                    placeholder="New password (min 10 chars)"
                    className="w-full pr-10 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeReset} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
                  <button type="submit" disabled={resetBusy} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg">
                    {resetBusy ? "Saving…" : "Set password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Users</h2>
            <PageHelp title="User Management" description="Create and manage WiFi user accounts. Each user is assigned to policy groups that determine their VLAN, session timeout, and bandwidth limits. The password hash and NT-hash are synced to FreeRADIUS immediately on every change." tips={["Users authenticate via PEAP-MSCHAPv2 (username + password) or EAP-TLS (client certificate)", "Assigning a user to a group instantly pushes the RADIUS policy to radcheck and radusergroup tables", "Suspending or deleting a user triggers a CoA Disconnect-Request on any currently active session"]} />
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} records displayed</p>
        </div>
        <button onClick={() => setShowAdd((show) => !show)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 font-medium">
          <Plus className="w-4 h-4" />New User
        </button>
      </div>
      {message && <div className="border border-rose-900 bg-rose-950/20 text-rose-300 rounded-lg p-3 text-sm">{message}</div>}
      {showAdd && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Username" className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white" />
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white" />
          <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Full name" className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white" />
          <input required minLength={10} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Temporary password" className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white" />
          <select value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })} className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white">
            <option value="">No group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm">Create user</button>
        </form>
      )}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl">
        <div className="p-3 border-b border-zinc-800">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-800"><th className="px-4 py-3">User</th><th className="px-4 py-3">Groups</th><th className="px-4 py-3">Devices</th><th className="px-4 py-3">MFA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-zinc-800/60">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3"><div className="text-zinc-100 font-medium">{user.fullName || user.username}</div><div className="text-xs text-zinc-500">{user.username} / {user.email}</div></td>
                <td className="px-4 py-3 text-zinc-300">{user.groups.map((group) => group.name).join(", ") || "-"}</td>
                <td className="px-4 py-3">
                  {user.devices.length === 0 ? (
                    <span className="text-zinc-600 text-xs">None</span>
                  ) : (
                    <div className="space-y-1">
                      {user.devices.map((d) => (
                        <div key={d.id} className="flex items-center gap-1.5">
                          <Smartphone className={`w-3 h-3 shrink-0 ${d.status === "approved" ? "text-emerald-400" : d.status === "rejected" ? "text-rose-400" : "text-amber-400"}`} />
                          <span className="font-mono text-xs text-zinc-300">{d.mac}</span>
                          {d.label && <span className="text-xs text-zinc-500">({d.label})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{user.mfaEnabled ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <span className="text-zinc-600">-</span>}</td>
                <td className="px-4 py-3">
                  <div className="text-zinc-300 capitalize">{user.status}</div>
                  {user.validUntil && (
                    <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      expires {new Date(user.validUntil).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => openEdit(user)} className="text-xs text-zinc-400 hover:text-indigo-300 flex items-center gap-1" title="Edit groups / expiry">
                      <Edit2 className="w-3.5 h-3.5" />Edit
                    </button>
                    <button onClick={() => { setResetTarget(user); setResetPwd(""); }} className="text-xs text-zinc-400 hover:text-amber-300 flex items-center gap-1" title="Reset password">
                      <KeyRound className="w-3.5 h-3.5" />Reset pwd
                    </button>
                    <button onClick={() => toggleStatus(user)} className="text-xs text-indigo-300 hover:text-indigo-200">{user.status === "active" ? "Suspend" : "Activate"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
