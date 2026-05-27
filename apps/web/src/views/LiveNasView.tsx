// ─────────────────────────────────────────────────────────────────────
//  Phase-2 NAS management view, replacing the AdminDashboard mock.
//
//  Lists real NAS rows from the API, allows add / edit / rotate-secret
//  / delete, and shows the freshly-rotated secret exactly once (the
//  back-end returns it inline; the UI must surface it before the
//  operator navigates away).
// ─────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cpu,
  Plus,
  RefreshCw,
  KeyRound,
  Trash2,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import type { NasClient, NasVendor, Site } from "@app/shared";
import { useAuth } from "../auth/AuthContext";
import {
  createNas,
  deleteNas,
  listNas,
  listSites,
  rotateNasSecret,
  updateNas,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { PageHelp } from "../components/PageHelp";

const VENDORS: NasVendor[] = ["cisco", "aruba", "ubiquiti", "mikrotik", "meraki", "other"];

export function LiveNasView() {
  const { token } = useAuth();
  const [items, setItems] = useState<NasClient[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ nasname: string; secret: string } | null>(
    null,
  );
  const [restartNeeded, setRestartNeeded] = useState(
    () => localStorage.getItem("radius_nas_restart_needed") === "true",
  );
  const [cmdCopied, setCmdCopied] = useState(false);

  const RESTART_CMD = "docker compose restart freeradius";

  function markRestartNeeded() {
    localStorage.setItem("radius_nas_restart_needed", "true");
    setRestartNeeded(true);
  }

  function dismissRestart() {
    localStorage.removeItem("radius_nas_restart_needed");
    setRestartNeeded(false);
  }

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [nas, s] = await Promise.all([listNas(token), listSites(token)]);
      setItems(nas.items);
      setSites(s);
    } catch (e) {
      setErr(e instanceof ApiCallError ? e.payload.message : "Failed to load NAS list");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Header onCreate={() => setCreating(true)} onReload={reload} loading={loading} />
        <PageHelp title="NAS Clients" description="Network Access Servers (NAS) are the access points, switches, or controllers that forward RADIUS authentication requests to this server. Each NAS must have a registered IP address and a shared secret that exactly matches the device's own RADIUS client configuration." tips={["The shared secret must match exactly what is configured on the AP or switch — a mismatch causes all authentication requests from that device to silently fail", "CoA port (default 3799) is used to send Disconnect-Requests and policy-change packets to live sessions on the NAS", "NAS entries are stored in the 'nas' Postgres table and read by FreeRADIUS via the SQL module — no SSH or config file editing required"]} />
      </div>

      {restartNeeded && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-200 mb-1">FreeRADIUS restart required</p>
            <p className="text-xs text-amber-400/80 mb-2">
              NAS client changes are stored in the database but FreeRADIUS reads them only at
              startup. Restart the container to apply the changes:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2.5 py-1.5 rounded bg-zinc-950/60 border border-amber-500/20 text-xs font-mono text-amber-200 truncate">
                {RESTART_CMD}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(RESTART_CMD).catch(() => {});
                  setCmdCopied(true);
                  setTimeout(() => setCmdCopied(false), 1500);
                }}
                className="shrink-0 px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                title="Copy command"
              >
                {cmdCopied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
          <button
            onClick={dismissRestart}
            className="shrink-0 text-amber-500/60 hover:text-amber-300 transition-colors"
            title="Dismiss (confirm you have restarted FreeRADIUS)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}

      <Table
        items={items}
        loading={loading}
        onRotate={async (id) => {
          if (!token) return;
          try {
            const r = await rotateNasSecret(token, id);
            setRevealedSecret({ nasname: r.nasname, secret: r.newSecret });
            markRestartNeeded();
            void reload();
          } catch (e) {
            setErr(e instanceof ApiCallError ? e.payload.message : "Failed to rotate secret");
          }
        }}
        onDelete={async (id) => {
          if (!token) return;
          if (!window.confirm("Delete this NAS? It will stop accepting RADIUS requests.")) return;
          try {
            await deleteNas(token, id);
            markRestartNeeded();
            void reload();
          } catch (e) {
            setErr(e instanceof ApiCallError ? e.payload.message : "Failed to delete NAS");
          }
        }}
        onToggleEnabled={async (nas) => {
          if (!token) return;
          try {
            await updateNas(token, nas.id, { enabled: !nas.enabled });
            markRestartNeeded();
            void reload();
          } catch (e) {
            setErr(e instanceof ApiCallError ? e.payload.message : "Update failed");
          }
        }}
      />

      {creating && (
        <CreateModal
          sites={sites}
          onClose={() => setCreating(false)}
          onCreated={(generated) => {
            setCreating(false);
            if (generated) setRevealedSecret(generated);
            markRestartNeeded();
            void reload();
          }}
        />
      )}

      {revealedSecret && (
        <SecretModal value={revealedSecret} onClose={() => setRevealedSecret(null)} />
      )}
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────

function Header({
  onCreate,
  onReload,
  loading,
}: {
  onCreate: () => void;
  onReload: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-zinc-300">
        <Cpu className="w-4 h-4 text-indigo-400" />
        <span className="font-medium text-zinc-100">NAS clients</span>
        <span className="text-zinc-500">— APs, WLCs, switches allowed to send RADIUS</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reload
        </button>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add NAS
        </button>
      </div>
    </div>
  );
}

function Table({
  items,
  loading,
  onRotate,
  onDelete,
  onToggleEnabled,
}: {
  items: NasClient[];
  loading: boolean;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (nas: NasClient) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center text-sm text-zinc-500">
        No NAS clients yet. Add an AP, WLC, or switch to start accepting RADIUS requests.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-[11px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="text-left px-4 py-2.5">Shortname</th>
            <th className="text-left px-4 py-2.5">NAS address</th>
            <th className="text-left px-4 py-2.5">Vendor</th>
            <th className="text-left px-4 py-2.5">CoA port</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-right px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.id} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
              <td className="px-4 py-2.5 font-medium text-zinc-100">{n.shortname}</td>
              <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{n.nasname}</td>
              <td className="px-4 py-2.5 text-zinc-400 capitalize">{n.type}</td>
              <td className="px-4 py-2.5 text-zinc-400">{n.coaPort}</td>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => onToggleEnabled(n)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    n.enabled
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-zinc-700/40 text-zinc-400"
                  }`}
                  title="Toggle enabled"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${n.enabled ? "bg-emerald-400" : "bg-zinc-500"}`}
                  />
                  {n.enabled ? "Enabled" : "Disabled"}
                </button>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onRotate(n.id)}
                    className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    title="Rotate shared secret"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(n.id)}
                    className="p-1.5 rounded-md hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateModal({
  sites,
  onClose,
  onCreated,
}: {
  sites: Site[];
  onClose: () => void;
  onCreated: (revealedSecret: { nasname: string; secret: string } | null) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    shortname: "",
    nasname: "",
    type: "other" as NasVendor,
    coaPort: 3799,
    siteId: "",
    description: "",
    customSecret: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = useMemo(
    () => form.shortname.length >= 1 && form.nasname.length >= 1,
    [form.shortname, form.nasname],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !valid) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createNas(token, {
        shortname: form.shortname,
        nasname: form.nasname,
        type: form.type,
        coaPort: form.coaPort,
        siteId: form.siteId || null,
        description: form.description || null,
        secret: form.customSecret || undefined,
      });
      onCreated(
        created._generatedSecret
          ? { nasname: created.nasname, secret: created._generatedSecret }
          : null,
      );
    } catch (e) {
      setErr(e instanceof ApiCallError ? e.payload.message : "Failed to create NAS");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add NAS" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Shortname" hint="Operator-friendly identifier, e.g. ap-hq-f1-01">
          <input
            value={form.shortname}
            onChange={(e) => setForm({ ...form, shortname: e.target.value })}
            required
            className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
          />
        </Field>
        <Field label="NAS address" hint="IPv4, CIDR (e.g. 10.40.1.0/24), or hostname">
          <input
            value={form.nasname}
            onChange={(e) => setForm({ ...form, nasname: e.target.value })}
            required
            className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as NasVendor })}
              className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
            >
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CoA port">
            <input
              type="number"
              value={form.coaPort}
              onChange={(e) => setForm({ ...form, coaPort: Number(e.target.value) })}
              min={1}
              max={65535}
              className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
            />
          </Field>
        </div>
        <Field label="Site" hint="Optional grouping for reporting">
          <select
            value={form.siteId}
            onChange={(e) => setForm({ ...form, siteId: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
          >
            <option value="">— None —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Shared secret"
          hint="Leave empty to auto-generate a 32-char base64url secret"
        >
          <input
            type="text"
            value={form.customSecret}
            onChange={(e) => setForm({ ...form, customSecret: e.target.value })}
            placeholder="(auto-generate)"
            className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono"
          />
        </Field>
        <Field label="Description">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={200}
            className="w-full px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
          />
        </Field>

        {err && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white font-medium disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SecretModal({
  value,
  onClose,
}: {
  value: { nasname: string; secret: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Shared secret" onClose={onClose}>
      <p className="text-sm text-zinc-300 mb-3">
        Copy the secret for <span className="font-mono text-indigo-300">{value.nasname}</span> now.
        It will not be shown again — you can always rotate it later.
      </p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-emerald-300 font-mono break-all">
          {value.secret}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value.secret).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="px-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
          title="Copy to clipboard"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-zinc-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
