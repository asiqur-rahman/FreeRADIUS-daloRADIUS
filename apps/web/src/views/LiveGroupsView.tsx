import { FormEvent, useCallback, useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import type { GroupSummary } from "@app/shared";
import { createGroup, listGroups } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

export function LiveGroupsView() {
  const { token } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (token) setGroups(await listGroups(token));
  }, [token]);
  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createGroup(token, form);
      setForm({ name: "", description: "" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create group");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-white">Groups & Policy</h2><p className="text-sm text-zinc-500 mt-0.5">Live RADIUS group attributes and memberships</p></div>
        <button onClick={() => setShowAdd((show) => !show)} className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" />New Group</button>
      </div>
      {error && <div className="border border-rose-900 text-rose-300 rounded-lg p-3 text-sm">{error}</div>}
      {showAdd && <form onSubmit={submit} className="flex gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Group name" className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm" /><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm" /><button className="bg-indigo-600 px-4 py-2 rounded-lg text-sm text-white">Create</button></form>}
      <div className="grid grid-cols-2 gap-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center"><Layers className="w-5 h-5 text-indigo-300" /></div><div><h3 className="text-white font-semibold">{group.name}</h3><p className="text-xs text-zinc-500">{group._count?.members ?? 0} members</p></div></div>
            <p className="text-xs text-zinc-400 mb-4">{group.description || "No description"}</p>
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              {group.attributes.map((attribute) => <div key={attribute.id} className="flex justify-between text-xs"><span className="text-zinc-400">{attribute.attribute}</span><span className="font-mono text-zinc-200">{attribute.op} {attribute.value}</span></div>)}
              {group.attributes.length === 0 && <span className="text-xs text-zinc-500">No RADIUS attributes assigned.</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
