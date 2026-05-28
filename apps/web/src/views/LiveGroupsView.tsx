import { FormEvent, useCallback, useEffect, useState } from "react";
import { Layers, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CreateGroupAttributeRequest, GroupAttribute, GroupSummary } from "@app/shared";
import {
  createGroup,
  createGroupAttribute,
  deleteGroupAttribute,
  listGroups,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

const DEFAULT_ATTRIBUTE_FORM: CreateGroupAttributeRequest = {
  attribute: "",
  op: ":=",
  value: "",
  kind: "reply",
};

function attrKey(name: string): string {
  return name.trim().toLowerCase();
}

function findAttribute(group: GroupSummary, name: string): GroupAttribute | undefined {
  return group.attributes.find((attribute) => attrKey(attribute.attribute) === attrKey(name));
}

function sessionTimeout(group: GroupSummary): string | null {
  return findAttribute(group, "Session-Timeout")?.value ?? null;
}

export function LiveGroupsView() {
  const { token } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setGroups(await listGroups(token));
  }, [token]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  const GROUP_TEMPLATES = [
    { name: "Staff",  description: "Employees" },
    { name: "Family", description: "Family members" },
    { name: "Guest",  description: "Guest access" },
  ];

  const createFromTemplate = async (tpl: typeof GROUP_TEMPLATES[number]) => {
    if (!token) return;
    setBusyKey(`tpl:${tpl.name}`);
    setError(null);
    try {
      await createGroup(token, { name: tpl.name, description: tpl.description });
      setNotice(`${tpl.name} group created.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create group");
    } finally {
      setBusyKey(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusyKey("create-group");
    setError(null);
    try {
      await createGroup(token, form);
      setForm({ name: "", description: "" });
      setShowAdd(false);
      setNotice("Group created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create group");
    } finally {
      setBusyKey(null);
    }
  };

  const addAttribute = async (groupId: string, body: CreateGroupAttributeRequest) => {
    if (!token) return;
    setBusyKey(`attr:${groupId}`);
    setError(null);
    try {
      await createGroupAttribute(token, groupId, body);
      setNotice(`Added ${body.attribute} to the group policy.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to add group attribute");
    } finally {
      setBusyKey(null);
    }
  };

  const removeAttribute = async (groupId: string, attribute: GroupAttribute) => {
    if (!token) return;
    setBusyKey(`delete:${attribute.id}`);
    setError(null);
    try {
      await deleteGroupAttribute(token, groupId, attribute.id);
      setNotice(`Removed ${attribute.attribute} from the group policy.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to remove group attribute");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Groups & Policy</h2>
            <PageHelp title="Groups & Policy" description="Policy groups define which RADIUS reply attributes FreeRADIUS returns to the NAS after successful authentication. Attributes include session limits, bandwidth policies, or any custom RADIUS AVP. All changes sync to radgroupreply and radusergroup instantly." tips={["Session-Timeout sets how many seconds a device stays connected before forced reauthentication", "Add any RADIUS reply attribute supported by your NAS — consult your AP vendor's documentation", "If a user belongs to multiple groups, the group with the lowest priority number wins"]} />
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">RADIUS reply attributes applied to approved devices on authentication.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {GROUP_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => void createFromTemplate(tpl)}
              disabled={!!busyKey}
              title={tpl.description}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              {busyKey === `tpl:${tpl.name}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
              {tpl.name}
            </button>
          ))}
          <button onClick={() => setShowAdd((show) => !show)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">
            <Plus className="h-4 w-4" />
            New Group
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/20 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-900 bg-emerald-950/20 p-3 text-sm text-emerald-300">{notice}</div>}

      {showAdd && (
        <form onSubmit={submit} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Group name"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Description"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <button disabled={busyKey === "create-group"} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60">
            {busyKey === "create-group" ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            busyKey={busyKey}
            onAddAttribute={addAttribute}
            onDeleteAttribute={removeAttribute}
          />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  busyKey,
  onAddAttribute,
  onDeleteAttribute,
}: {
  group: GroupSummary;
  busyKey: string | null;
  onAddAttribute: (groupId: string, body: CreateGroupAttributeRequest) => Promise<void>;
  onDeleteAttribute: (groupId: string, attribute: GroupAttribute) => Promise<void>;
}) {
  const [attributeForm, setAttributeForm] = useState<CreateGroupAttributeRequest>(DEFAULT_ATTRIBUTE_FORM);

  const submitAttribute = async (event: FormEvent) => {
    event.preventDefault();
    await onAddAttribute(group.id, attributeForm);
    setAttributeForm(DEFAULT_ATTRIBUTE_FORM);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15">
          <Layers className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h3 className="font-semibold text-white">{group.name}</h3>
          <p className="text-xs text-zinc-500">{group._count?.members ?? 0} members</p>
        </div>
      </div>

      <p className="mb-4 text-xs text-zinc-400">{group.description || "No description"}</p>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Session Timeout</div>
          <div className="mt-1 text-xl font-semibold text-white">{sessionTimeout(group) || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Reply Attributes</div>
          <div className="mt-1 text-xl font-semibold text-white">{group.attributes.filter((attribute) => attribute.kind === "reply").length}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Current attributes</div>
        {group.attributes.map((attribute) => (
          <div key={attribute.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
            <div>
              <div className="text-zinc-200">{attribute.attribute}</div>
              <div className="mt-1 font-mono text-zinc-500">{attribute.kind} {attribute.op} {attribute.value}</div>
            </div>
            <button
              onClick={() => void onDeleteAttribute(group.id, attribute)}
              disabled={busyKey === `delete:${attribute.id}`}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60"
              title="Remove attribute"
            >
              {busyKey === `delete:${attribute.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
        {group.attributes.length === 0 && <span className="text-xs text-zinc-500">No RADIUS attributes assigned.</span>}
      </div>

      <form onSubmit={submitAttribute} className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
        <div className="text-sm font-medium text-zinc-100">Add reply or check attribute</div>
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            value={attributeForm.attribute}
            onChange={(event) => setAttributeForm({ ...attributeForm, attribute: event.target.value })}
            placeholder="Attribute name"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <input
            required
            value={attributeForm.value}
            onChange={(event) => setAttributeForm({ ...attributeForm, value: event.target.value })}
            placeholder="Value"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={attributeForm.kind}
            onChange={(event) => setAttributeForm({ ...attributeForm, kind: event.target.value as CreateGroupAttributeRequest["kind"] })}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="reply">reply</option>
            <option value="check">check</option>
          </select>
          <select
            value={attributeForm.op}
            onChange={(event) => setAttributeForm({ ...attributeForm, op: event.target.value })}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            {[':=', '==', '=', '+=', '!=', '>', '<', '>=', '<=', '=~', '!~', '=*', '!*'].map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <button
            disabled={busyKey === `attr:${group.id}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busyKey === `attr:${group.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
