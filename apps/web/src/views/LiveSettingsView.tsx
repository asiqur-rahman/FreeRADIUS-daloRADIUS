import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";
import type { CaInfo, EapCertificate } from "@app/shared";
import {
  type LdapSettingsResponse,
  type RadiusAllowedIp,
  type PlatformSettingsResponse,
  type SamlSettingsResponse,
  getLdapSettings,
  getSamlSettings,
  listCerts,
  listRadiusAllowlist,
  createRadiusAllowedIp,
  updateRadiusAllowedIp,
  deleteRadiusAllowedIp,
  getPlatformSettings,
  updatePlatformSettings,
  saveLdapSettings,
  saveSamlSettings,
  testLdapConnection,
  runLdapSync,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

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

  const metadataUrl = `${window.location.origin}/api/v1/saml/metadata`;
  const loginUrl    = `${window.location.origin}/api/v1/saml/login`;

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
            <p className="text-zinc-300 font-mono">ACS URL: {window.location.origin}/api/v1/saml/callback</p>
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
      <TelegramPanel token={token} />
      <LdapPanel token={token} />
      <SamlPanel token={token} />
      <CertPanel token={token} />
      <IpAllowlistPanel token={token} />
    </div>
  );
}
