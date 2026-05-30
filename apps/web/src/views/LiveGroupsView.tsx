import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ChevronRight, Layers, Loader2, Network,
  Plus, Save, Trash2, Wifi, Shield, Users, Smartphone, Server, Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CreateGroupAttributeRequest, GroupAttribute, GroupSummary } from "@app/shared";
import type { GroupPolicy } from "../api/endpoints";
import {
  createGroup, createGroupAttribute, deleteGroupAttribute,
  listGroups, updateGroupPolicy,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

// ── Policy presets ────────────────────────────────────────────────────────────

interface PolicyPreset {
  label:       string;
  description: string;
  icon:        LucideIcon;
  color:       string;
  policy:      GroupPolicy;
}

const PRESETS: PolicyPreset[] = [
  {
    label:       "Corporate Staff",
    description: "Full corporate access — no bandwidth cap, 8 h session",
    icon:        Users,
    color:       "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
    policy: {
      vlanId:            10,
      downloadMbps:      null,
      uploadMbps:        null,
      sessionTimeoutSec: 28_800,   // 8 h
      idleTimeoutSec:    null,
    },
  },
  {
    label:       "Guest / Public",
    description: "Isolated guest VLAN, 10 Mbps down/5 up, 4 h max, 30 min idle",
    icon:        Wifi,
    color:       "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    policy: {
      vlanId:            100,
      downloadMbps:      10,
      uploadMbps:        5,
      sessionTimeoutSec: 14_400,  // 4 h
      idleTimeoutSec:    1_800,   // 30 min
    },
  },
  {
    label:       "IoT / Devices",
    description: "Locked-down IoT VLAN, 2 Mbps cap, long 24 h session",
    icon:        Smartphone,
    color:       "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    policy: {
      vlanId:            200,
      downloadMbps:      2,
      uploadMbps:        1,
      sessionTimeoutSec: 86_400,  // 24 h
      idleTimeoutSec:    null,
    },
  },
  {
    label:       "Restricted",
    description: "Probationary access — 5 Mbps, 2 h session, 15 min idle",
    icon:        Lock,
    color:       "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    policy: {
      vlanId:            50,
      downloadMbps:      5,
      uploadMbps:        2,
      sessionTimeoutSec: 7_200,   // 2 h
      idleTimeoutSec:    900,     // 15 min
    },
  },
  {
    label:       "Management",
    description: "IT/admin VLAN — no limits, 12 h session",
    icon:        Server,
    color:       "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
    policy: {
      vlanId:            5,
      downloadMbps:      null,
      uploadMbps:        null,
      sessionTimeoutSec: 43_200,  // 12 h
      idleTimeoutSec:    null,
    },
  },
  {
    label:       "Secure Guest",
    description: "High-security guest — isolated VLAN, 5 Mbps, 2 h, 20 min idle",
    icon:        Shield,
    color:       "border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20",
    policy: {
      vlanId:            300,
      downloadMbps:      5,
      uploadMbps:        2,
      sessionTimeoutSec: 7_200,   // 2 h
      idleTimeoutSec:    1_200,   // 20 min
    },
  },
];

// ── RADIUS attribute catalogue ────────────────────────────────────────────────

interface AttrOption { label: string; value: string; hint: string; defaultOp?: string; defaultKind?: "reply" | "check"; }

const ATTR_GROUPS: { group: string; items: AttrOption[] }[] = [
  {
    group: "VLAN Assignment (RFC 2868)",
    items: [
      { label: "Tunnel-Private-Group-ID", value: "Tunnel-Private-Group-ID", hint: "VLAN ID (1–4094) — set this alone; Type & Medium are auto-completed by server", defaultOp: ":=", defaultKind: "reply" },
      { label: "Tunnel-Type",             value: "Tunnel-Type",             hint: "Always 13 (VLAN) — auto-set when Tunnel-Private-Group-ID is present",           defaultOp: ":=", defaultKind: "reply" },
      { label: "Tunnel-Medium-Type",      value: "Tunnel-Medium-Type",      hint: "Always 6 (IEEE-802) — auto-set when Tunnel-Private-Group-ID is present",        defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Bandwidth — Standard (WISPr, most APs)",
    items: [
      { label: "WISPr-Bandwidth-Max-Down", value: "WISPr-Bandwidth-Max-Down", hint: "Download cap in bytes/sec (e.g. 10485760 = 10 Mbps)", defaultOp: ":=", defaultKind: "reply" },
      { label: "WISPr-Bandwidth-Max-Up",   value: "WISPr-Bandwidth-Max-Up",   hint: "Upload cap in bytes/sec (e.g. 5242880 = 5 Mbps)",   defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Bandwidth — MikroTik",
    items: [
      { label: "Mikrotik-Rate-Limit", value: "Mikrotik-Rate-Limit", hint: "Upload/Download e.g. \"5M/10M\"", defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Bandwidth — Cisco",
    items: [
      { label: "Cisco-AVPair", value: "Cisco-AVPair", hint: "Cisco policy pair e.g. \"ip:sub-qos-policy-in=POLICY\"", defaultOp: "+=", defaultKind: "reply" },
    ],
  },
  {
    group: "Session Control",
    items: [
      { label: "Session-Timeout", value: "Session-Timeout", hint: "Max session time in seconds (e.g. 3600 = 1 h). Use the policy card instead.", defaultOp: ":=", defaultKind: "reply" },
      { label: "Idle-Timeout",    value: "Idle-Timeout",    hint: "Disconnect after N idle seconds. Use the policy card instead.",              defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Access Control",
    items: [
      { label: "Filter-Id",         value: "Filter-Id",         hint: "ACL/firewall policy name applied by the NAS (e.g. \"GUEST_ACL\")",  defaultOp: ":=", defaultKind: "reply" },
      { label: "Reply-Message",     value: "Reply-Message",     hint: "Text message sent to the supplicant/user",                          defaultOp: "=",  defaultKind: "reply" },
      { label: "Class",             value: "Class",             hint: "Session class tag passed through to accounting (e.g. \"guest\")",   defaultOp: ":=", defaultKind: "reply" },
      { label: "Framed-IP-Address", value: "Framed-IP-Address", hint: "Assign a specific static IP address to users in this group",       defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Aruba / HPE",
    items: [
      { label: "Aruba-User-Role", value: "Aruba-User-Role", hint: "Aruba named role (e.g. \"staff\")", defaultOp: ":=", defaultKind: "reply" },
      { label: "Aruba-User-Vlan", value: "Aruba-User-Vlan", hint: "Aruba VLAN assignment (1–4094)",    defaultOp: ":=", defaultKind: "reply" },
    ],
  },
  {
    group: "Custom",
    items: [
      { label: "Custom attribute…", value: "__custom__", hint: "Enter any RADIUS attribute name manually", defaultOp: ":=", defaultKind: "reply" },
    ],
  },
];

const ALL_ATTR_OPTIONS = ATTR_GROUPS.flatMap((g) => g.items);
function findAttrOption(value: string): AttrOption | undefined {
  return ALL_ATTR_OPTIONS.find((o) => o.value === value && o.value !== "__custom__");
}

const DEFAULT_FORM: CreateGroupAttributeRequest = { attribute: "", op: ":=", value: "", kind: "reply" };
const MANAGED_POLICY_ATTRS = new Set([
  "Tunnel-Type", "Tunnel-Medium-Type", "Tunnel-Private-Group-ID",
  "WISPr-Bandwidth-Max-Down", "WISPr-Bandwidth-Max-Up",
  "Session-Timeout", "Idle-Timeout",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function attrKey(name: string) { return name.trim().toLowerCase(); }
function findAttr(group: GroupSummary, name: string) {
  return group.attributes.find((a) => attrKey(a.attribute) === attrKey(name));
}

function parseGroupPolicy(group: GroupSummary): GroupPolicy {
  const vlan    = findAttr(group, "Tunnel-Private-Group-ID")?.value;
  const down    = findAttr(group, "WISPr-Bandwidth-Max-Down")?.value;
  const up      = findAttr(group, "WISPr-Bandwidth-Max-Up")?.value;
  const session = findAttr(group, "Session-Timeout")?.value;
  const idle    = findAttr(group, "Idle-Timeout")?.value;
  return {
    vlanId:            vlan    ? parseInt(vlan, 10)    || null : null,
    downloadMbps:      down    ? +(parseInt(down, 10)  / (1024 * 1024)).toFixed(2) || null : null,
    uploadMbps:        up      ? +(parseInt(up, 10)    / (1024 * 1024)).toFixed(2) || null : null,
    sessionTimeoutSec: session ? parseInt(session, 10) || null : null,
    idleTimeoutSec:    idle    ? parseInt(idle, 10)    || null : null,
  };
}

function fmtSeconds(sec: number | null): string {
  if (!sec) return "—";
  if (sec >= 3600) return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)}h`;
  if (sec >= 60)   return `${Math.round(sec / 60)}min`;
  return `${sec}s`;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function LiveGroupsView() {
  const { token } = useAuth();
  const [groups,  setGroups]  = useState<GroupSummary[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState({ name: "", description: "" });
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setGroups(await listGroups(token));
  }, [token]);

  useEffect(() => { void load().catch((err: Error) => setError(err.message)); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusyKey("create-group"); setError(null);
    try {
      await createGroup(token, form);
      setForm({ name: "", description: "" }); setShowAdd(false);
      setNotice("Group created."); await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create group");
    } finally { setBusyKey(null); }
  };

  const addAttribute = async (groupId: string, body: CreateGroupAttributeRequest) => {
    if (!token) return;
    setBusyKey(`attr:${groupId}`); setError(null);
    try {
      await createGroupAttribute(token, groupId, body);
      setNotice(`Added ${body.attribute}.`); await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to add attribute");
    } finally { setBusyKey(null); }
  };

  const removeAttribute = async (groupId: string, attr: GroupAttribute) => {
    if (!token) return;
    setBusyKey(`del:${attr.id}`); setError(null);
    try {
      await deleteGroupAttribute(token, groupId, attr.id);
      setNotice(`Removed ${attr.attribute}.`); await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to remove attribute");
    } finally { setBusyKey(null); }
  };

  const savePolicy = async (groupId: string, policy: GroupPolicy) => {
    if (!token) return;
    setBusyKey(`policy:${groupId}`); setError(null);
    try {
      await updateGroupPolicy(token, groupId, policy);
      setNotice("Network policy saved."); await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to save policy");
    } finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Groups & Policy</h2>
            <PageHelp title="Groups & Policy"
              description="Policy groups define RADIUS reply attributes returned after successful auth. Use the Network Policy card for VLAN, bandwidth, and session presets, or the advanced editor for any RADIUS attribute."
              tips={[
                "Apply a preset to quickly configure common policies like Guest or Corporate",
                "VLAN: set Tunnel-Private-Group-ID — Type and Medium are auto-completed by the server",
                "Bandwidth: uses WISPr-Bandwidth-Max-Down/Up (bytes/sec), works on most APs",
                "Session-Timeout forces re-authentication after N seconds. Idle-Timeout disconnects idle devices.",
                "Multiple groups: lowest priority number wins on attribute conflicts",
              ]}
            />
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">RADIUS reply attributes applied to approved devices on authentication.</p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">
          <Plus className="h-4 w-4" />New Group
        </button>
      </div>

      {error  && <div className="rounded-lg border border-rose-900   bg-rose-950/20   p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-900 bg-emerald-950/20 p-3 text-sm text-emerald-300">{notice}</div>}

      {showAdd && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row">
          <input required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Group name"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white" />
          <input value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white" />
          <button disabled={busyKey === "create-group"}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60">
            {busyKey === "create-group" ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} busyKey={busyKey}
            onAddAttribute={addAttribute}
            onDeleteAttribute={removeAttribute}
            onSavePolicy={savePolicy} />
        ))}
        {groups.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            No groups yet. Create one above to get started.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group, busyKey, onAddAttribute, onDeleteAttribute, onSavePolicy }: {
  group: GroupSummary;
  busyKey: string | null;
  onAddAttribute:  (id: string, body: CreateGroupAttributeRequest) => Promise<void>;
  onDeleteAttribute: (id: string, attr: GroupAttribute) => Promise<void>;
  onSavePolicy: (id: string, policy: GroupPolicy) => Promise<void>;
}) {
  const [attrForm,     setAttrForm]     = useState<CreateGroupAttributeRequest>(DEFAULT_FORM);
  const [selectedAttr, setSelectedAttr] = useState<string>("__custom__");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Network policy local state — synced from group prop
  const [policy, setPolicy] = useState<GroupPolicy>(() => parseGroupPolicy(group));
  useEffect(() => { setPolicy(parseGroupPolicy(group)); }, [group]);

  // Derived display strings for the fields
  const [vlanStr,    setVlanStr]    = useState(() => policy.vlanId?.toString()            ?? "");
  const [dlStr,      setDlStr]      = useState(() => policy.downloadMbps?.toString()      ?? "");
  const [ulStr,      setUlStr]      = useState(() => policy.uploadMbps?.toString()        ?? "");
  const [sessStr,    setSessStr]    = useState(() => policy.sessionTimeoutSec ? String(policy.sessionTimeoutSec / 3600) : "");
  const [idleStr,    setIdleStr]    = useState(() => policy.idleTimeoutSec   ? String(policy.idleTimeoutSec   / 60)   : "");

  useEffect(() => {
    setVlanStr(policy.vlanId?.toString()            ?? "");
    setDlStr(policy.downloadMbps?.toString()        ?? "");
    setUlStr(policy.uploadMbps?.toString()          ?? "");
    setSessStr(policy.sessionTimeoutSec ? String(policy.sessionTimeoutSec / 3600) : "");
    setIdleStr(policy.idleTimeoutSec   ? String(policy.idleTimeoutSec   / 60)   : "");
  }, [policy]);

  const applyPreset = (p: PolicyPreset) => {
    setPolicy(p.policy);
    // update string fields
    setVlanStr(p.policy.vlanId?.toString() ?? "");
    setDlStr(p.policy.downloadMbps?.toString() ?? "");
    setUlStr(p.policy.uploadMbps?.toString() ?? "");
    setSessStr(p.policy.sessionTimeoutSec ? String(p.policy.sessionTimeoutSec / 3600) : "");
    setIdleStr(p.policy.idleTimeoutSec   ? String(p.policy.idleTimeoutSec   / 60)   : "");
  };

  const handleAttrSelect = (value: string) => {
    setSelectedAttr(value);
    if (value === "__custom__") {
      setAttrForm(DEFAULT_FORM);
    } else {
      const opt = findAttrOption(value);
      if (opt) setAttrForm({ attribute: opt.value, op: opt.defaultOp ?? ":=", kind: opt.defaultKind ?? "reply", value: "" });
    }
  };

  const submitAttribute = async (e: FormEvent) => {
    e.preventDefault();
    await onAddAttribute(group.id, attrForm);
    setAttrForm(DEFAULT_FORM); setSelectedAttr("__custom__");
  };

  const submitPolicy = async (e: FormEvent) => {
    e.preventDefault();
    const vid  = vlanStr.trim()  ? parseInt(vlanStr.trim(), 10)    : null;
    const dl   = dlStr.trim()    ? parseFloat(dlStr.trim())         : null;
    const ul   = ulStr.trim()    ? parseFloat(ulStr.trim())         : null;
    const sess = sessStr.trim()  ? Math.round(parseFloat(sessStr.trim()) * 3600) : null;
    const idle = idleStr.trim()  ? Math.round(parseFloat(idleStr.trim()) * 60)   : null;
    if (vid !== null && (isNaN(vid) || vid < 1 || vid > 4094)) return;
    await onSavePolicy(group.id, { vlanId: vid, downloadMbps: dl, uploadMbps: ul, sessionTimeoutSec: sess, idleTimeoutSec: idle });
  };

  const policyBusy = busyKey === `policy:${group.id}`;
  const attrBusy   = busyKey === `attr:${group.id}`;
  const replyAttrs = group.attributes.filter((a) => a.kind === "reply").length;
  const hint = findAttrOption(selectedAttr)?.hint;

  // Summary pills for the current policy
  const currentPolicy = parseGroupPolicy(group);
  const hasPolicySummary = Object.values(currentPolicy).some((v) => v !== null);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 flex-shrink-0">
          <Layers className="h-5 w-5 text-indigo-300" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{group.name}</h3>
          <p className="text-xs text-zinc-500">{group._count?.members ?? 0} members · {replyAttrs} reply attrs</p>
        </div>
      </div>

      {group.description && <p className="text-xs text-zinc-400 -mt-2">{group.description}</p>}

      {/* Current policy summary pills */}
      {hasPolicySummary && (
        <div className="flex flex-wrap gap-1.5">
          {currentPolicy.vlanId && (
            <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              VLAN {currentPolicy.vlanId}
            </span>
          )}
          {currentPolicy.downloadMbps && (
            <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              ↓ {currentPolicy.downloadMbps} Mbps
            </span>
          )}
          {currentPolicy.uploadMbps && (
            <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              ↑ {currentPolicy.uploadMbps} Mbps
            </span>
          )}
          {currentPolicy.sessionTimeoutSec && (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Session {fmtSeconds(currentPolicy.sessionTimeoutSec)}
            </span>
          )}
          {currentPolicy.idleTimeoutSec && (
            <span className="rounded-md border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              Idle {fmtSeconds(currentPolicy.idleTimeoutSec)}
            </span>
          )}
        </div>
      )}

      {/* ── Network Policy Card ── */}
      <form onSubmit={submitPolicy} className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <span className="text-sm font-medium text-indigo-200">Network Policy</span>
        </div>

        {/* Preset buttons */}
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Quick presets</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button key={p.label} type="button"
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${p.color}`}>
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600">Click a preset to fill the fields below, then save.</p>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">VLAN ID</label>
            <input type="number" min={1} max={4094} value={vlanStr}
              onChange={(e) => setVlanStr(e.target.value)}
              placeholder="e.g. 100"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Download (Mbps)</label>
            <input type="number" min={0.1} step="any" value={dlStr}
              onChange={(e) => setDlStr(e.target.value)}
              placeholder="e.g. 50"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Upload (Mbps)</label>
            <input type="number" min={0.1} step="any" value={ulStr}
              onChange={(e) => setUlStr(e.target.value)}
              placeholder="e.g. 20"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Session max (hours)</label>
            <input type="number" min={0.017} step="any" value={sessStr}
              onChange={(e) => setSessStr(e.target.value)}
              placeholder="e.g. 8"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Idle timeout (min)</label>
            <input type="number" min={1} step="any" value={idleStr}
              onChange={(e) => setIdleStr(e.target.value)}
              placeholder="e.g. 30"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none" />
          </div>
          <div className="flex items-end">
            <button disabled={policyBusy} type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
              {policyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>

        <p className="text-[10px] text-zinc-600">
          Blank = not applied. VLAN auto-completes Tunnel-Type/Medium. Session in hours · Idle in minutes.
        </p>
      </form>

      {/* ── Advanced Attributes (collapsible) ── */}
      <button onClick={() => setShowAdvanced((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-950/50 transition">
        <span className="font-medium text-zinc-300">Advanced attributes</span>
        <span className="flex items-center gap-1 text-zinc-500">
          {group.attributes.length} total
          {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {showAdvanced && (
        <div className="space-y-3">
          {/* Attribute list */}
          <div className="space-y-1.5">
            {group.attributes.length === 0 && <p className="text-xs text-zinc-500">No attributes yet.</p>}
            {group.attributes.map((attr) => (
              <div key={attr.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                  MANAGED_POLICY_ATTRS.has(attr.attribute)
                    ? "border-indigo-500/15 bg-indigo-500/5"
                    : "border-zinc-800 bg-zinc-950/40"
                }`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-200 truncate">{attr.attribute}</span>
                    {MANAGED_POLICY_ATTRS.has(attr.attribute) && (
                      <span className="flex-shrink-0 rounded border border-indigo-500/20 px-1 text-[9px] text-indigo-400/70">policy</span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-zinc-500">{attr.kind} {attr.op} {attr.value}</div>
                </div>
                <button onClick={() => void onDeleteAttribute(group.id, attr)}
                  disabled={busyKey === `del:${attr.id}`}
                  className="ml-2 flex-shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60"
                  title="Remove">
                  {busyKey === `del:${attr.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>

          {/* Add attribute form */}
          <form onSubmit={submitAttribute} className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
            <p className="text-xs font-medium text-zinc-300">Add attribute</p>
            <select value={selectedAttr} onChange={(e) => handleAttrSelect(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none">
              {ATTR_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {hint && <p className="text-[10px] text-zinc-500">{hint}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectedAttr === "__custom__" && (
                <input required value={attrForm.attribute}
                  onChange={(e) => setAttrForm({ ...attrForm, attribute: e.target.value })}
                  placeholder="Attribute name"
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none" />
              )}
              <input required value={attrForm.value}
                onChange={(e) => setAttrForm({ ...attrForm, value: e.target.value })}
                placeholder="Value"
                className={`rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none ${selectedAttr !== "__custom__" ? "sm:col-span-2" : ""}`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select value={attrForm.kind}
                onChange={(e) => setAttrForm({ ...attrForm, kind: e.target.value as "reply" | "check" })}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-white focus:outline-none">
                <option value="reply">reply</option>
                <option value="check">check</option>
              </select>
              <select value={attrForm.op}
                onChange={(e) => setAttrForm({ ...attrForm, op: e.target.value })}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-white focus:outline-none">
                {[":=","==","=","+=","!=",">","<",">=","<=","=~","!~","=*","!*"].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <button disabled={attrBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-2 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-60">
                {attrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
