import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Search, ShieldCheck } from "lucide-react";
import type { GroupSummary, UserSummary } from "@app/shared";
import { createUser, listGroups, listUsers, updateUser } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

export function LiveUsersView() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", fullName: "", password: "", groupId: "" });
  const [message, setMessage] = useState<string | null>(null);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Users</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} records displayed</p>
        </div>
        <button onClick={() => setShowAdd((show) => !show)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 font-medium">
          <Plus className="w-4 h-4" />New User
        </button>
      </div>
      {message && <div className="border border-rose-900 bg-rose-950/20 text-rose-300 rounded-lg p-3 text-sm">{message}</div>}
      {showAdd && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
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
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-800"><th className="px-4 py-3">User</th><th className="px-4 py-3">Groups</th><th className="px-4 py-3">MFA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-zinc-800/60">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3"><div className="text-zinc-100 font-medium">{user.fullName || user.username}</div><div className="text-xs text-zinc-500">{user.username} / {user.email}</div></td>
                <td className="px-4 py-3 text-zinc-300">{user.groups.map((group) => group.name).join(", ") || "-"}</td>
                <td className="px-4 py-3">{user.mfaEnabled ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <span className="text-zinc-600">-</span>}</td>
                <td className="px-4 py-3 text-zinc-300 capitalize">{user.status}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => toggleStatus(user)} className="text-xs text-indigo-300 hover:text-indigo-200">{user.status === "active" ? "Suspend" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
