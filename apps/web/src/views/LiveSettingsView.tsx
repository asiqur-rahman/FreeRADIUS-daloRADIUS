import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { EapCertificate } from "@app/shared";
import {
  type RadiusAllowedIp,
  listCerts,
  listRadiusAllowlist,
  createRadiusAllowedIp,
  updateRadiusAllowedIp,
  deleteRadiusAllowedIp,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

// ── EAP Certificates panel ─────────────────────────────────────────────────

function CertPanel({ token }: { token: string }) {
  const [certs, setCerts] = useState<EapCertificate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCerts(token).then(setCerts).catch((err: Error) => setError(err.message));
  }, [token]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-amber-400" />
        <h3 className="font-semibold text-white">EAP Server Certificates</h3>
      </div>
      {error && (
        <div className="mb-3 rounded-lg border border-rose-900 bg-rose-950/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}
      {certs.map((cert) => (
        <div key={cert.id} className="flex items-center gap-3 border-t border-zinc-800 py-3">
          {cert.severity === "ok" ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-100 truncate">{cert.subject}</div>
            <div className="font-mono text-xs text-zinc-500">{cert.fingerprint.slice(0, 20)}…</div>
          </div>
          <div className="shrink-0 text-xs text-zinc-400">
            {cert.isActive ? "Active · " : ""}
            {cert.daysUntilExpiry} days
          </div>
        </div>
      ))}
      {certs.length === 0 && (
        <p className="text-sm text-zinc-500">No EAP certificates inventoried yet.</p>
      )}
    </div>
  );
}

// ── RADIUS IP Allowlist panel ──────────────────────────────────────────────

function IpAllowlistPanel({ token }: { token: string }) {
  const [entries, setEntries] = useState<RadiusAllowedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [cidr, setCidr] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listRadiusAllowlist(token));
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to load allowlist",
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const addEntry = async () => {
    if (!cidr.trim()) return;
    setAdding(true);
    setNotice(null);
    try {
      await createRadiusAllowedIp(token, { cidr: cidr.trim(), label: label.trim() || undefined });
      setCidr("");
      setLabel("");
      setShowAdd(false);
      await load();
      setNotice({ ok: true, text: `${cidr.trim()} added to allowlist.` });
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to add entry",
      });
    } finally {
      setAdding(false);
    }
  };

  const toggleEnabled = async (entry: RadiusAllowedIp) => {
    setBusy(entry.id);
    try {
      await updateRadiusAllowedIp(token, entry.id, { enabled: !entry.enabled });
      await load();
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to update entry",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeEntry = async (entry: RadiusAllowedIp) => {
    setBusy(entry.id);
    try {
      await deleteRadiusAllowedIp(token, entry.id);
      await load();
      setNotice({ ok: true, text: `${entry.cidr} removed.` });
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to remove entry",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-indigo-400" />
          <h3 className="font-semibold text-white">RADIUS Hook IP Guard</h3>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Add CIDR
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        When <code className="rounded bg-zinc-800 px-1 text-zinc-300">RADIUS_IP_GUARD_ENABLED=true</code>,
        only source IPs matching these CIDRs may call the FreeRADIUS hook.
        An empty list allows all IPs.
      </p>

      {notice && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            notice.ok
              ? "border-emerald-900 bg-emerald-950/20 text-emerald-300"
              : "border-rose-900 bg-rose-950/20 text-rose-300"
          }`}
        >
          {notice.text}
        </div>
      )}

      {showAdd && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
          <input
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="192.168.1.0/24 or 10.0.0.1"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-600 focus:outline-none"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-600 focus:outline-none"
          />
          <button
            onClick={() => void addEntry()}
            disabled={adding || !cidr.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500">
          No rules — all source IPs are permitted when guard is enabled.
        </p>
      )}

      {!loading && entries.length > 0 && (
        <div className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`h-2 w-2 rounded-full ${entry.enabled ? "bg-emerald-400" : "bg-zinc-600"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-zinc-100">{entry.cidr}</div>
                {entry.label && (
                  <div className="text-xs text-zinc-500">{entry.label}</div>
                )}
              </div>
              <button
                onClick={() => void toggleEnabled(entry)}
                disabled={busy === entry.id}
                title={entry.enabled ? "Disable" : "Enable"}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                {entry.enabled ? (
                  <ToggleRight className="h-5 w-5 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => void removeEntry(entry)}
                disabled={busy === entry.id}
                title="Remove"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-950/30 hover:text-rose-300 disabled:opacity-50"
              >
                {busy === entry.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Settings view ─────────────────────────────────────────────────────

export function LiveSettingsView() {
  const { token } = useAuth();

  if (!token) return null;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-white">Settings</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Certificate inventory, security posture, and RADIUS hook controls.
        </p>
      </div>

      <CertPanel token={token} />
      <IpAllowlistPanel token={token} />
    </div>
  );
}
