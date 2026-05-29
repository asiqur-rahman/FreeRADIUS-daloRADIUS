import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Upload,
  Users,
} from "lucide-react";
import type { CaInfo, CertSeverity, EapCertificate } from "@app/shared";
import {
  type LdapSettingsResponse,
  type RadiusAllowedIp,
  type PlatformSettingsResponse,
  type CertSubjectSettings,
  type FreeRadiusReloadResult,
  type SamlSettingsResponse,
  getLdapSettings,
  getSamlSettings,
  listCerts,
  addCert,
  activateCert,
  deleteCert,
  listRadiusAllowlist,
  createRadiusAllowedIp,
  updateRadiusAllowedIp,
  deleteRadiusAllowedIp,
  getPlatformSettings,
  updatePlatformSettings,
  triggerFreeRadiusReload,
  saveLdapSettings,
  saveSamlSettings,
  testLdapConnection,
  runLdapSync,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

// ── EAP Certificates panel ─────────────────────────────────────────────────

const SEVERITY_STYLE: Record<CertSeverity, { bar: string; label: string; icon: React.ReactNode }> = {
  ok:          { bar: "bg-emerald-500", label: "OK",       icon: <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" /> },
  "warn-60":   { bar: "bg-amber-400",   label: "60 days",  icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" /> },
  "warn-30":   { bar: "bg-orange-500",  label: "30 days",  icon: <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" /> },
  "critical-7":{ bar: "bg-rose-500",    label: "CRITICAL", icon: <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" /> },
  expired:     { bar: "bg-rose-700",    label: "EXPIRED",  icon: <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" /> },
};

function CertPanel({ token }: { token: string }) {
  const [certs, setCerts]       = useState<EapCertificate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notice, setNotice]     = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied]     = useState<string | null>(null);
  const [busy, setBusy]         = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [pem, setPem]               = useState("");
  const [notes, setNotes]           = useState("");
  const [activateOnAdd, setActivateOnAdd] = useState(false);
  const [uploading, setUploading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCerts(await listCerts(token));
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Failed to load certificates" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const copySha1 = async (id: string, sha1: string) => {
    await navigator.clipboard.writeText(sha1.toUpperCase());
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleUpload = async () => {
    if (!pem.trim()) return;
    setUploading(true); setNotice(null);
    try {
      await addCert(token, { pem: pem.trim(), activate: activateOnAdd, notes: notes.trim() || null });
      setNotice({ ok: true, text: `Certificate added${activateOnAdd ? " and activated" : ""}.` });
      setPem(""); setNotes(""); setActivateOnAdd(false); setShowUpload(false);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
    } finally { setUploading(false); }
  };

  const handleActivate = async (id: string) => {
    setBusy(id); setNotice(null);
    try {
      await activateCert(token, id);
      setNotice({ ok: true, text: "Certificate activated." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Activate failed" });
    } finally { setBusy(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this certificate? This cannot be undone.")) return;
    setBusy(id); setNotice(null);
    try {
      await deleteCert(token, id);
      setNotice({ ok: true, text: "Certificate deleted." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Delete failed" });
    } finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-amber-400" />
          <h3 className="font-semibold text-white">EAP Server Certificates</h3>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload PEM
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Track RADIUS server certificate expiry. Receive alerts at 60 / 30 / 7 days.
        The SHA-1 thumbprint is required for Windows 11 WPA2-Enterprise "Trusted certificate thumbprints".
      </p>

      {/* Notice */}
      {notice && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
          notice.ok ? "border-emerald-900 bg-emerald-950/20 text-emerald-300"
                    : "border-rose-900 bg-rose-950/20 text-rose-300"
        }`}>
          {notice.text}
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="mb-4 space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/40 p-4">
          <p className="text-xs text-zinc-400">
            Paste the <strong className="text-zinc-200">public certificate PEM</strong> of your RADIUS server's EAP certificate
            (the one referenced by <code className="rounded bg-zinc-800 px-1 text-zinc-300">certificate = …</code> in FreeRADIUS
            <code className="rounded bg-zinc-800 px-1 text-zinc-300"> eap.conf</code>).
            The private key is <em>not</em> required or stored here — this is for tracking and alerts only.
          </p>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Certificate PEM</label>
            <textarea
              rows={6}
              value={pem}
              onChange={(e) => setPem(e.target.value)}
              placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. renewed 2026-05, Let's Encrypt"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activateOnAdd}
              onChange={(e) => setActivateOnAdd(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-xs text-zinc-300">Mark as active certificate</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => void handleUpload()}
              disabled={uploading || !pem.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Add Certificate
            </button>
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && certs.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-4 py-6 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-500">No EAP server certificates uploaded yet.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Click <strong className="text-zinc-400">Upload PEM</strong> to add the public certificate from your
            FreeRADIUS <code className="rounded bg-zinc-800 px-1">eap.conf</code> and start tracking expiry.
          </p>
        </div>
      )}

      {/* Certificate list */}
      {!loading && certs.map((cert) => {
        const s = SEVERITY_STYLE[cert.severity];
        return (
          <div key={cert.id} className="border-t border-zinc-800 py-4 space-y-2">
            {/* Top row: icon, subject, days, active badge, actions */}
            <div className="flex items-start gap-3">
              {s.icon}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-zinc-100 font-medium truncate">{cert.subject}</span>
                  {cert.isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-700/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      ACTIVE
                    </span>
                  )}
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bar} bg-opacity-20 text-white`}>
                    {cert.daysUntilExpiry >= 0 ? `${cert.daysUntilExpiry}d remaining` : "EXPIRED"}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                  SHA-256: {cert.fingerprint.slice(0, 32)}…
                </div>
                {cert.notes && (
                  <div className="text-xs text-zinc-600 mt-0.5">{cert.notes}</div>
                )}
                <div className="text-xs text-zinc-600 mt-0.5">
                  Issued: {new Date(cert.issuedAt).toLocaleDateString()} ·
                  Expires: {new Date(cert.expiresAt).toLocaleDateString()}
                </div>
              </div>
              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1.5">
                {!cert.isActive && (
                  <button
                    onClick={() => void handleActivate(cert.id)}
                    disabled={busy === cert.id}
                    title="Set as active certificate"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {busy === cert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Activate
                  </button>
                )}
                {!cert.isActive && (
                  <button
                    onClick={() => void handleDelete(cert.id)}
                    disabled={busy === cert.id}
                    title="Delete certificate"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-950/30 hover:text-rose-300 disabled:opacity-50"
                  >
                    {busy === cert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Windows WPA2-Enterprise thumbprint row */}
            <div className="ml-7 flex items-center gap-2 rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
                  Windows thumbprint (SHA-1) — paste into "Trusted certificate thumbprints"
                </div>
                <div className="font-mono text-xs text-zinc-300 break-all select-all">
                  {cert.fingerprintSha1
                    ? cert.fingerprintSha1.toUpperCase()
                    : <span className="text-zinc-600 italic">Re-upload this cert to generate</span>
                  }
                </div>
              </div>
              {cert.fingerprintSha1 && (
                <button
                  onClick={() => void copySha1(cert.id, cert.fingerprintSha1!)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Copy SHA-1 for Windows"
                >
                  {copied === cert.id
                    ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</>
                    : <><Copy className="h-3 w-3" /> Copy</>
                  }
                </button>
              )}
            </div>
          </div>
        );
      })}
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

// ── Telegram settings panel ────────────────────────────────────────────────

function TelegramPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<PlatformSettingsResponse | null>(null);
  const [botToken,    setBotToken]    = useState("");
  const [adminChatId, setAdminChatId] = useState("");
  const [showToken, setShowToken]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [notice, setNotice]           = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getPlatformSettings(token);
      setSettings(s);
      // Pre-fill with the masked token so the user can see it's set
      setBotToken(s.telegram.botToken ?? "");
      setAdminChatId(s.telegram.adminChatId ?? "");
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to load settings",
      });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const s = await updatePlatformSettings(token, {
        telegram: {
          botToken:    botToken.trim() || null,
          adminChatId: adminChatId.trim() || null,
        },
      });
      setSettings(s);
      setBotToken(s.telegram.botToken ?? "");
      setAdminChatId(s.telegram.adminChatId ?? "");
      setNotice({ ok: true, text: s.telegram.configured ? "Telegram configured — polling restarted." : "Telegram credentials cleared." });
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setBotToken("");
    setAdminChatId("");
    setSaving(true);
    setNotice(null);
    try {
      await updatePlatformSettings(token, {
        telegram: { botToken: null, adminChatId: null },
      });
      setSettings(await getPlatformSettings(token));
      setNotice({ ok: true, text: "Telegram credentials cleared." });
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Failed to clear",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center gap-3">
        <Bot className="h-5 w-5 text-sky-400" />
        <div>
          <h3 className="font-semibold text-white">Telegram Notifications</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Get real-time device approval requests and decide directly from Telegram.
          </p>
        </div>
        {settings?.telegram.configured && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Active
          </span>
        )}
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
          notice.ok
            ? "border-emerald-900 bg-emerald-950/20 text-emerald-300"
            : "border-rose-900 bg-rose-950/20 text-rose-300"
        }`}>
          {notice.text}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Bot Token
            <span className="ml-1 text-zinc-600">(from @BotFather)</span>
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="1234567890:AABCDefGHIjklmnopqrstUVWXyz…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Admin Chat ID
            <span className="ml-1 text-zinc-600">(message @userinfobot to get yours)</span>
          </label>
          <input
            type="text"
            value={adminChatId}
            onChange={(e) => setAdminChatId(e.target.value)}
            placeholder="123456789"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Save & restart bot
          </button>
          {settings?.telegram.configured && (
            <button
              onClick={() => void handleClear()}
              disabled={saving}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-rose-300 disabled:opacity-60"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-500 space-y-1">
        <p><span className="text-zinc-400 font-medium">Setup:</span> Message <code className="text-zinc-300">@BotFather</code> → <code className="text-zinc-300">/newbot</code> → copy the token above.</p>
        <p>Send any message to the bot, then get your Chat ID from <code className="text-zinc-300">@userinfobot</code>.</p>
        <p>Approvals made via Telegram are instantly reflected in this dashboard, and vice versa.</p>
      </div>
    </div>
  );
}

// ── LDAP / Active Directory panel ─────────────────────────────────────────

function LdapPanel({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LdapSettingsResponse | null>(null);
  const [form, setForm] = useState<Partial<LdapSettingsResponse>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getLdapSettings(token);
      setSettings(s);
      setForm(s);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      await saveLdapSettings(token, form);
      setNotice({ ok: true, text: "LDAP settings saved." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setNotice(null);
    try {
      const res = await testLdapConnection(token);
      setNotice({ ok: res.ok, text: res.ok ? "Connection successful." : `Connection failed: ${res.error}` });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Test failed" });
    } finally { setTesting(false); }
  };

  const sync = async () => {
    setSyncing(true); setNotice(null);
    try {
      const res = await runLdapSync(token);
      const errs = res.errors.length ? ` Errors: ${res.errors.join("; ")}` : "";
      setNotice({ ok: res.errors.length === 0, text: `Sync complete — ${res.usersCreated} created, ${res.usersSkipped} skipped, ${res.membershipsAdded} memberships added.${errs}` });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Sync failed" });
    } finally { setSyncing(false); }
  };

  const f = (key: keyof LdapSettingsResponse) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3">
        <Users className="h-5 w-5 text-sky-400" />
        <h3 className="flex-1 text-left font-semibold text-white">LDAP / Active Directory Sync</h3>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>
      {!open && <p className="mt-1 pl-8 text-xs text-zinc-500">Import users and groups from an LDAP or AD server.</p>}

      {open && (
        <div className="mt-4 space-y-4">
          {notice && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-rose-800 bg-rose-950/30 text-rose-300"}`}>
              {notice.text}
            </div>
          )}

          {[
            { key: "url" as const, label: "LDAP URL", placeholder: "ldap://192.168.1.10:389" },
            { key: "bindDn" as const, label: "Bind DN", placeholder: "CN=svcaccount,DC=corp,DC=local" },
            { key: "bindPassword" as const, label: "Bind Password", placeholder: "••••••••", type: "password" },
            { key: "userBaseDn" as const, label: "User Base DN", placeholder: "OU=Users,DC=corp,DC=local" },
            { key: "userFilter" as const, label: "User Filter", placeholder: "(objectClass=user)" },
            { key: "groupBaseDn" as const, label: "Group Base DN", placeholder: "OU=Groups,DC=corp,DC=local" },
            { key: "groupFilter" as const, label: "Group Filter", placeholder: "(objectClass=group)" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
              <input
                type={type ?? "text"}
                value={(form[key] ?? settings?.[key]) ?? ""}
                onChange={f(key)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "attrUsername" as const, label: "Username attribute", placeholder: "sAMAccountName" },
              { key: "attrEmail" as const, label: "Email attribute", placeholder: "mail" },
              { key: "attrFullname" as const, label: "Full name attribute", placeholder: "displayName" },
              { key: "attrGroupName" as const, label: "Group name attribute", placeholder: "cn" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
                <input
                  value={(form[key] ?? settings?.[key]) ?? ""}
                  onChange={f(key)}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Save
            </button>
            <button onClick={test} disabled={testing || !settings?.url}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-60">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Test Connection
            </button>
            <button onClick={sync} disabled={syncing || !settings?.url}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-60">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Sync Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SAML 2.0 SP panel ─────────────────────────────────────────────────────

function SamlPanel({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SamlSettingsResponse | null>(null);
  const [form, setForm] = useState<Partial<SamlSettingsResponse>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getSamlSettings(token);
      setSettings(s);
      setForm(s);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      await saveSamlSettings(token, { ...form, enabled: form.enabled ?? false });
      setNotice({ ok: true, text: "SAML settings saved." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const apiBase     = import.meta.env.VITE_API_URL ?? window.location.origin;
  const metadataUrl = `${apiBase}/api/v1/saml/metadata`;
  const loginUrl    = `${apiBase}/api/v1/saml/login`;

  const f = (key: keyof SamlSettingsResponse) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3">
        <Link2 className="h-5 w-5 text-violet-400" />
        <h3 className="flex-1 text-left font-semibold text-white">SAML 2.0 Single Sign-On</h3>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>
      {!open && <p className="mt-1 pl-8 text-xs text-zinc-500">Federate login to any SAML 2.0 identity provider (Azure AD, Okta, etc.)</p>}

      {open && (
        <div className="mt-4 space-y-4">
          {notice && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-rose-800 bg-rose-950/30 text-rose-300"}`}>
              {notice.text}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
            <span className="text-sm text-zinc-400">Enable SSO</span>
            <button type="button" onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))}
              className="ml-auto text-zinc-400 hover:text-white">
              {form.enabled
                ? <ToggleRight className="h-6 w-6 text-indigo-400" />
                : <ToggleLeft className="h-6 w-6" />}
            </button>
          </div>

          <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/30 px-4 py-3 text-xs">
            <p className="text-zinc-400 font-medium">SP endpoints (register these with your IdP):</p>
            <p className="text-zinc-300 font-mono">Metadata: {metadataUrl}</p>
            <p className="text-zinc-300 font-mono">ACS URL: {apiBase}/api/v1/saml/callback</p>
            <p className="text-zinc-300 font-mono">SSO Login: {loginUrl}</p>
          </div>

          {[
            { key: "entryPoint" as const, label: "IdP SSO URL (Entry Point)", placeholder: "https://login.microsoftonline.com/.../saml2" },
            { key: "issuer" as const, label: "SP Entity ID / Issuer", placeholder: "https://radius.yourdomain.com/saml" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
              <input value={(form[key] ?? settings?.[key]) ?? ""}
                onChange={f(key)} placeholder={placeholder}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none" />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">IdP Certificate (PEM, without headers)</label>
            <textarea rows={4} value={(form.cert ?? settings?.cert) ?? ""}
              onChange={f("cert")} placeholder="MIIC…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "attrUsername" as const, label: "Username attr", placeholder: "http://schemas…/name" },
              { key: "attrEmail" as const, label: "Email attr", placeholder: "NameID or email" },
              { key: "attrFullname" as const, label: "Full name attr", placeholder: "displayname" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
                <input value={(form[key] ?? settings?.[key]) ?? ""}
                  onChange={f(key)} placeholder={placeholder}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none" />
              </div>
            ))}
          </div>

          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Save SAML Settings
          </button>
        </div>
      )}
    </div>
  );
}

// ── Certificate Authority panel ────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  db:   "Stored in DB (configured via admin)",
  env:  "Loaded from environment variables",
  auto: "Auto-generated dev CA (saved to DB)",
};

function CaPanel({ token }: { token: string }) {
  const [info, setInfo] = useState<CaInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [keyPass, setKeyPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [regen, setRegen] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getPlatformSettings(token);
      setInfo(s.ca);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const handleUpload = async () => {
    if (!certPem.trim() || !keyPem.trim()) return;
    setSaving(true); setNotice(null);
    try {
      await updatePlatformSettings(token, {
        ca: { certPem: certPem.trim(), keyPem: keyPem.trim(), keyPassphrase: keyPass.trim() || null },
      });
      setNotice({ ok: true, text: "CA certificate saved and active." });
      setCertPem(""); setKeyPem(""); setKeyPass(""); setShowUpload(false);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const handleRegenerate = async () => {
    setRegen(true); setNotice(null);
    try {
      await updatePlatformSettings(token, { ca: { regenerate: true } });
      setNotice({ ok: true, text: "New dev CA generated and saved to DB." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Regeneration failed" });
    } finally { setRegen(false); }
  };

  const sourceLabel = info?.source ? (SOURCE_LABEL[info.source] ?? info.source) : null;
  const expiring = info?.expiresAt
    ? (new Date(info.expiresAt).getTime() - Date.now()) / 86_400_000
    : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <FileLock2 className="h-5 w-5 text-amber-400" />
          <div>
            <div className="font-semibold text-white">Certificate Authority (CA)</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {info == null
                ? "Loading…"
                : info.configured
                  ? `${info.subject?.split(",")[0] ?? "Configured"} · ${expiring != null ? `expires in ${Math.round(expiring)} days` : ""}`
                  : "Not configured — click to set up"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {info?.configured && (
            <span className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full ${
              (expiring ?? 9999) < 30
                ? "bg-rose-950/60 text-rose-400 border border-rose-800"
                : "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
            }`}>
              {(expiring ?? 9999) < 30 ? "Expiring soon" : "Active"}
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-5 pb-5 space-y-4 pt-4">
          {notice && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              notice.ok ? "border-emerald-900 bg-emerald-950/20 text-emerald-300" : "border-rose-900 bg-rose-950/20 text-rose-300"
            }`}>
              {notice.ok ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5" /> : <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />}
              {notice.text}
            </div>
          )}

          {info?.configured ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 divide-y divide-zinc-800">
              {[
                ["Subject",      info.subject],
                ["Issuer",       info.issuer],
                ["Expires",      info.expiresAt ? new Date(info.expiresAt).toLocaleDateString() : null],
                ["Fingerprint",  info.fingerprint],
                ["Source",       sourceLabel],
              ].map(([label, val]) => val && (
                <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-xs text-zinc-500">{label}</span>
                  <span className="text-xs text-zinc-200 font-mono break-all">{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              No CA configured. Upload a CA cert + key, or click Regenerate to auto-generate a dev CA.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showUpload ? "Cancel upload" : "Upload custom CA"}
            </button>
            <button
              onClick={() => void handleRegenerate()}
              disabled={regen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              {regen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate dev CA
            </button>
          </div>

          {showUpload && (
            <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/40 p-4">
              <p className="text-xs text-zinc-400">
                Paste a PEM-encoded CA certificate and its unencrypted private key.
                The key is stored in the database — use a dedicated intermediate CA, not your root CA.
              </p>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">CA Certificate (PEM)</label>
                <textarea
                  rows={5}
                  value={certPem}
                  onChange={(e) => setCertPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">CA Private Key (PEM)</label>
                <textarea
                  rows={5}
                  value={keyPem}
                  onChange={(e) => setKeyPem(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;…&#10;-----END RSA PRIVATE KEY-----"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Key passphrase (optional)</label>
                <input
                  type="password"
                  value={keyPass}
                  onChange={(e) => setKeyPass(e.target.value)}
                  placeholder="Leave blank if the key is unencrypted"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <button
                onClick={() => void handleUpload()}
                disabled={saving || !certPem.trim() || !keyPem.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Save CA
              </button>
            </div>
          )}

          <p className="text-xs text-zinc-600">
            This CA signs all EAP-TLS client certificates and is also served as the downloadable
            "WiFi CA" in the user portal. One CA, one place.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Certificate Issuance Settings panel ───────────────────────────────────────

function CertSettingsPanel({ token }: { token: string }) {
  const [form, setForm]     = useState<Partial<CertSubjectSettings>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getPlatformSettings(token);
      setForm(s.certSettings);
      setLoaded(true);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Failed to load" });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const f = (key: keyof CertSubjectSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      const updated = await updatePlatformSettings(token, { certSettings: form });
      setForm(updated.certSettings);
      setNotice({ ok: true, text: "Certificate settings saved. New certs issued from now will use these values." });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-1 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-violet-400" />
        <div>
          <h3 className="font-semibold text-white">Certificate Issuance Settings</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            X.509 subject fields stamped into every EAP-TLS client certificate issued by this platform.
            Changes apply to <em>new</em> certificates only — existing certs are unaffected.
          </p>
        </div>
      </div>

      {notice && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          notice.ok ? "border-emerald-900 bg-emerald-950/20 text-emerald-300"
                    : "border-rose-900 bg-rose-950/20 text-rose-300"
        }`}>
          {notice.ok ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5" /> : <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />}
          {notice.text}
        </div>
      )}

      {!loaded ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Validity days */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Validity period (days)
              <span className="ml-1 text-zinc-600">— max 397 (browser / MDM limit)</span>
            </label>
            <input
              type="number" min={1} max={397}
              value={form.validityDays ?? 365}
              onChange={(e) => setForm((p) => ({ ...p, validityDays: parseInt(e.target.value, 10) || 365 }))}
              className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-violet-600 focus:outline-none"
            />
          </div>

          {/* Subject fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { key: "organization" as const,       label: "Organization (O)",           placeholder: "Acme Corp",      required: true },
              { key: "organizationalUnit" as const,  label: "Organizational Unit (OU)",   placeholder: "IT / Managed WiFi" },
              { key: "country" as const,             label: "Country (C)",                placeholder: "US", maxLength: 2, hint: "2-letter ISO code" },
              { key: "state" as const,               label: "State / Province (ST)",      placeholder: "California" },
              { key: "locality" as const,            label: "City / Locality (L)",        placeholder: "San Francisco" },
            ].map(({ key, label, placeholder, required, hint, maxLength }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  {label}
                  {required && <span className="ml-1 text-rose-400">*</span>}
                  {hint && <span className="ml-1 text-zinc-600">— {hint}</span>}
                </label>
                <input
                  value={String(form[key] ?? "")}
                  onChange={f(key)}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
                />
              </div>
            ))}
          </div>

          {/* Preview */}
          {form.organization && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Certificate subject preview</div>
              <code className="text-xs font-mono text-zinc-300 break-all">
                CN=&lt;username&gt;{form.organization ? `, O=${form.organization}` : ""}{form.organizationalUnit ? `, OU=${form.organizationalUnit}` : ""}{form.country ? `, C=${form.country.toUpperCase()}` : ""}{form.state ? `, ST=${form.state}` : ""}{form.locality ? `, L=${form.locality}` : ""}
              </code>
            </div>
          )}

          {/* Self-service toggle */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 flex items-start gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-200">Allow users to generate their own WiFi certificates</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                When enabled, users can generate their own EAP-TLS certificate from the WiFi Certificate page.
                When disabled, only admins can issue certs — users can still view and use certs issued for them.
              </div>
            </div>
            <button
              role="switch"
              aria-checked={form.userSelfService ?? true}
              onClick={() => setForm((p) => ({ ...p, userSelfService: !(p.userSelfService ?? true) }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 mt-0.5 ${
                (form.userSelfService ?? true) ? "bg-violet-600" : "bg-zinc-700"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                (form.userSelfService ?? true) ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <button
            onClick={() => void save()}
            disabled={saving || !form.organization?.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Save Certificate Settings
          </button>
        </div>
      )}
    </div>
  );
}

// ── FreeRADIUS Auto-Reload panel ───────────────────────────────────────────────

function FreeRadiusPanel({ token }: { token: string }) {
  const [cmd, setCmd]       = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<FreeRadiusReloadResult | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getPlatformSettings(token);
      setCmd(s.freeradius.reloadCommand ?? "");
      setLoaded(true);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Failed to load" });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      await updatePlatformSettings(token, { freeradius: { reloadCommand: cmd.trim() || null } });
      setNotice({ ok: true, text: cmd.trim() ? "Reload command saved — will run automatically after each NAS change." : "Auto-reload disabled." });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setNotice(null); setLastResult(null);
    try {
      const result = await triggerFreeRadiusReload(token);
      setLastResult(result);
      if (!result.triggered) {
        setNotice({ ok: false, text: "No reload command configured — save a command first." });
      } else if (result.success) {
        setNotice({ ok: true, text: "FreeRADIUS reloaded successfully." });
      } else {
        setNotice({ ok: false, text: `Reload command failed: ${result.error ?? "unknown error"}` });
      }
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Trigger failed" });
    } finally { setTesting(false); }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-1 flex items-center gap-3">
        <Server className="h-5 w-5 text-emerald-400" />
        <div>
          <h3 className="font-semibold text-white">FreeRADIUS Auto-Reload</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Automatically restart or reload FreeRADIUS whenever a NAS client is added, updated, or deleted.
            NAS changes are always saved to the database immediately — reload ensures FreeRADIUS picks them
            up without manual intervention.
          </p>
        </div>
      </div>

      {notice && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          notice.ok ? "border-emerald-900 bg-emerald-950/20 text-emerald-300"
                    : "border-rose-900 bg-rose-950/20 text-rose-300"
        }`}>
          {notice.ok ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5" /> : <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />}
          {notice.text}
        </div>
      )}

      {!loaded ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Reload command
              <span className="ml-1 text-zinc-600">— executed as the API server process user</span>
            </label>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="e.g. systemctl reload freeradius"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Example commands */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-4 py-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Common examples</div>
            {(
              [
                ["Graceful reload (recommended)", "systemctl reload freeradius"],
                ["Full restart (drops sessions)", "systemctl restart freeradius"],
                ["Docker Compose",                "docker compose exec freeradius kill -HUP 1"],
                ["Docker direct",                 "docker exec freeradius kill -HUP 1"],
                ["PID file SIGHUP",               "kill -HUP $(cat /var/run/freeradius/freeradius.pid)"],
                ["radmin socket",                 "radmin -e 'hup server'"],
              ] as [string, string][]
            ).map(([label, example]) => (
              <div key={example} className="flex items-center gap-2">
                <button
                  onClick={() => setCmd(example)}
                  className="shrink-0 text-[10px] text-indigo-400 hover:text-indigo-200 underline"
                >
                  use
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-zinc-500">{label}: </span>
                  <code className="text-[11px] font-mono text-zinc-300">{example}</code>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={() => void test()}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
              Test Now
            </button>
            {!cmd.trim() && (
              <span className="text-xs text-zinc-500">Leave blank to disable auto-reload.</span>
            )}
          </div>

          {/* Last result detail */}
          {lastResult?.triggered && (
            <div className={`rounded-lg border px-4 py-3 text-xs font-mono space-y-1 ${
              lastResult.success
                ? "border-emerald-800 bg-emerald-950/20 text-emerald-300"
                : "border-rose-800 bg-rose-950/20 text-rose-300"
            }`}>
              <div className="font-semibold not-italic text-sm mb-1">
                {lastResult.success ? "✓ Reload succeeded" : "✗ Reload failed"}
              </div>
              {lastResult.stdout && <div className="text-zinc-400">stdout: {lastResult.stdout}</div>}
              {lastResult.stderr && <div className="text-zinc-500">stderr: {lastResult.stderr}</div>}
              {lastResult.error  && <div>{lastResult.error}</div>}
            </div>
          )}

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-4 py-3 text-xs text-zinc-500 space-y-1">
            <p><span className="text-zinc-400 font-medium">Note:</span> The command runs as the user that owns the API server process.
            For <code className="bg-zinc-800 px-1 rounded text-zinc-300">systemctl</code> commands, the API user needs sudo access
            to reload/restart FreeRADIUS, or use a sudoers rule:
            </p>
            <code className="block rounded bg-zinc-900 px-2 py-1.5 text-zinc-300">
              api-user ALL=(ALL) NOPASSWD: /bin/systemctl reload freeradius
            </code>
            <p className="mt-1">
              <strong className="text-zinc-400">FreeRADIUS SQL module</strong>: If using <code className="bg-zinc-800 px-1 rounded">rlm_sql</code> to
              read the <code className="bg-zinc-800 px-1 rounded">nas</code> table, some builds re-read on each request
              (no reload needed). Check your <code className="bg-zinc-800 px-1 rounded">modules/sql</code> config.
            </p>
          </div>
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
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <PageHelp title="Platform Settings" description="Platform-wide configuration controls. Changes here affect authentication security policy, RADIUS hook authentication, CoA behavior when policies change, and notification integrations." tips={["RADIUS Hook Secret must match the X-Radius-Hook-Secret header configured in FreeRADIUS rlm_rest — mismatches will break all RADIUS policy callbacks", "IP Guard restricts /radius/* endpoints to a registered allowlist of FreeRADIUS server IPs — enable in production", "Telegram bot token and admin chat ID enable real-time device approval request notifications"]} />
        </div>
        <p className="mt-0.5 text-sm text-zinc-500">
          Certificate inventory, security posture, and RADIUS hook controls.
        </p>
      </div>

      <CaPanel token={token} />
      <CertSettingsPanel token={token} />
      <FreeRadiusPanel token={token} />
      <TelegramPanel token={token} />
      <LdapPanel token={token} />
      <SamlPanel token={token} />
      <CertPanel token={token} />
      <IpAllowlistPanel token={token} />
    </div>
  );
}
