import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound,
  Plus, RefreshCw, Shield, ShieldOff, Trash2, User, X,
} from "lucide-react";
import type { GroupSummary, ProvisionUserCertResponse, UserClientCert, UserRole, UserStatus, UserSummary } from "@app/shared";
import { listUserCerts, provisionUserCert, revokeUserCert, updateUser } from "../api/endpoints";

// ── helpers ────────────────────────────────────────────────────────────────

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 ${props.className ?? ""}`}
    />
  );
}

// ── component ──────────────────────────────────────────────────────────────

interface Props {
  user: UserSummary;
  groups: GroupSummary[];
  token: string;
  onClose: () => void;
  onSaved: (updated: UserSummary) => void;
}

export function UserEditDrawer({ user, groups, token, onClose, onSaved }: Props) {
  const [username, setUsername]     = useState(user.username);
  const [email, setEmail]           = useState(user.email);
  const [fullName, setFullName]     = useState(user.fullName ?? "");
  const [role, setRole]             = useState<UserRole>(user.role);
  const [status, setStatus]         = useState<UserStatus>(user.status);
  const [validFrom, setValidFrom]   = useState(toLocal(user.validFrom));
  const [validUntil, setValidUntil] = useState(toLocal(user.validUntil));
  const [groupIds, setGroupIds]     = useState<string[]>(user.groups.map((g) => g.id));

  const [newPwd, setNewPwd]       = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [savedPwd, setSavedPwd]   = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Cert state ──────────────────────────────────────────────────────
  const [certs, setCerts]             = useState<UserClientCert[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certBundle, setCertBundle]   = useState<ProvisionUserCertResponse | null>(null);
  const [certBundleCopied, setCertBundleCopied] = useState(false);
  const [provisioningCert, setProvisioningCert] = useState(false);

  const loadCerts = useCallback(async () => {
    if (!token) return;
    setCertsLoading(true);
    try {
      const list = await listUserCerts(token, user.id);
      setCerts(list);
    } catch { /* silently ignore */ } finally {
      setCertsLoading(false);
    }
  }, [token, user.id]);

  useEffect(() => { void loadCerts(); }, [loadCerts]);

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // lock scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const toggleGroup = (id: string) =>
    setGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const usernameChanged = username.toLowerCase() !== user.username;

  const handleProvisionCert = async () => {
    setProvisioningCert(true);
    try {
      const bundle = await provisionUserCert(token, user.id, {});
      setCertBundle(bundle);
      await loadCerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate provisioning failed");
    } finally {
      setProvisioningCert(false);
    }
  };

  const handleRevokeCert = async (certId: string) => {
    try {
      await revokeUserCert(token, user.id, certId);
      await loadCerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  const downloadPkcs12 = (bundle: ProvisionUserCertResponse) => {
    const bytes = Uint8Array.from(atob(bundle.pkcs12Base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/x-pkcs12" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${user.username}-wifi.p12`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!username.trim() || !email.trim()) {
      setError("Username and email are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof updateUser>[2] = {
        email: email.toLowerCase().trim(),
        fullName: fullName.trim() || null,
        role,
        status,
        groupIds,
        validFrom:  validFrom  ? new Date(validFrom).toISOString()  : null,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      };

      if (usernameChanged) body.username = username.trim().toLowerCase();
      if (newPwd)          body.newPassword = newPwd;

      const updated = await updateUser(token, user.id, body);
      setSavedPwd(newPwd || null);
      setNewPwd("");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-[520px] bg-zinc-900 border-l border-zinc-700 flex flex-col shadow-2xl">
        {/* ── header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{user.fullName || user.username}</div>
              <div className="text-xs text-zinc-500">@{user.username}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {error && (
            <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-3 text-sm text-rose-300">{error}</div>
          )}

          {/* ── Identity ── */}
          <section className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Identity</h3>

            <Field label="Username">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="^[a-zA-Z0-9._-]+$"
                minLength={2}
                maxLength={64}
              />
              {usernameChanged && (
                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Renaming will update all FreeRADIUS records immediately.
                </p>
              )}
            </Field>

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
              />
            </Field>

            <Field label="Full name">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Optional"
                maxLength={120}
              />
            </Field>
          </section>

          {/* ── Account ── */}
          <section className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Account</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  <option value="guest">Guest</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>

              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Valid from">
                <Input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="[color-scheme:dark]"
                />
              </Field>

              <Field label="Valid until">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="datetime-local"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="[color-scheme:dark]"
                  />
                  {validUntil && (
                    <button
                      type="button"
                      onClick={() => setValidUntil("")}
                      className="text-zinc-500 hover:text-rose-400 shrink-0"
                      title="Clear expiry"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </section>

          {/* ── Groups ── */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Groups</h3>
            {groups.length === 0 ? (
              <p className="text-sm text-zinc-600">No groups defined yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto -mx-1 px-1">
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="w-4 h-4 accent-indigo-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 font-medium">{g.name}</div>
                      {g.description && (
                        <div className="text-xs text-zinc-500 truncate">{g.description}</div>
                      )}
                    </div>
                    {g.isDefault && (
                      <span className="ml-auto text-[10px] bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 px-1.5 py-0.5 rounded shrink-0">
                        default
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* ── Password ── */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Change Password</h3>
            <p className="text-xs text-zinc-500">Leave blank to keep the existing password.</p>

            {savedPwd ? (
              <div className="space-y-2">
                <p className="text-xs text-emerald-400">Password updated. Copy and share it once — it won't be shown again.</p>
                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
                  <span className="flex-1 font-mono text-sm text-white break-all">
                    {showPwd ? savedPwd : "•".repeat(savedPwd.length)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="text-zinc-500 hover:text-zinc-300 shrink-0"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(savedPwd)}
                    className="text-zinc-500 hover:text-emerald-400 shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="New password (min 10 chars)"
                    minLength={10}
                    maxLength={256}
                    className="pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="p-1 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      title="Generate random password"
                      onClick={() => { const p = randomPassword(); setNewPwd(p); setShowPwd(true); }}
                      className="p-1 text-zinc-500 hover:text-indigo-400"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {newPwd && newPwd.length < 10 && (
                  <p className="text-xs text-rose-400">Password must be at least 10 characters</p>
                )}
              </div>
            )}
          </section>

          {/* ── WiFi Certificates ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">WiFi Certificate — works on all devices</h3>
              <button
                type="button"
                onClick={handleProvisionCert}
                disabled={provisioningCert}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-600/40 text-indigo-300 rounded-lg disabled:opacity-50"
              >
                {provisioningCert ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Provision
              </button>
            </div>
            <p className="text-xs text-zinc-500">Provisioned certs allow passwordless WiFi via EAP-TLS. Any device presenting the cert is auto-approved.</p>

            {/* New bundle display */}
            {certBundle && (
              <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                  <KeyRound className="w-3.5 h-3.5" />
                  Certificate issued — download now, key shown once
                </div>
                <div className="text-xs text-zinc-400 font-mono break-all">CN: {certBundle.commonName}</div>
                <div className="text-xs text-zinc-400 font-mono">Expires: {new Date(certBundle.expiresAt).toLocaleDateString()}</div>
                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded px-2 py-1">
                  <span className="flex-1 text-xs font-mono text-zinc-300 truncate">Password: {certBundle.pkcs12Password}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(certBundle.pkcs12Password);
                      setCertBundleCopied(true);
                      setTimeout(() => setCertBundleCopied(false), 2000);
                    }}
                    className="text-zinc-500 hover:text-emerald-400 shrink-0"
                  >
                    {certBundleCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadPkcs12(certBundle)}
                    className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5"
                  >
                    Download .p12
                  </button>
                  <button
                    type="button"
                    onClick={() => setCertBundle(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Cert list */}
            {certsLoading ? (
              <p className="text-xs text-zinc-600">Loading…</p>
            ) : certs.length === 0 ? (
              <p className="text-xs text-zinc-600">No certificates provisioned.</p>
            ) : (
              <div className="space-y-1.5">
                {certs.map((c) => (
                  <div key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${c.revokedAt ? "border-zinc-800 bg-zinc-950/30 opacity-50" : "border-zinc-700 bg-zinc-950/50"}`}>
                    <KeyRound className={`w-3 h-3 shrink-0 ${c.revokedAt ? "text-zinc-600" : "text-indigo-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-zinc-300 truncate">{c.commonName}</div>
                      <div className="text-zinc-500">
                        {c.revokedAt ? (
                          <span className="text-rose-400">Revoked {new Date(c.revokedAt).toLocaleDateString()}</span>
                        ) : (
                          <>Expires {new Date(c.expiresAt).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>
                    {!c.revokedAt && (
                      <button
                        type="button"
                        title="Revoke certificate"
                        onClick={() => handleRevokeCert(c.id)}
                        className="text-zinc-600 hover:text-rose-400 shrink-0 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.revokedAt && <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── MFA info ── */}
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Security</h3>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-950/50 rounded-lg border border-zinc-800">
              {user.mfaEnabled ? (
                <>
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-zinc-300">TOTP / MFA is enabled</span>
                </>
              ) : (
                <>
                  <ShieldOff className="w-4 h-4 text-zinc-600 shrink-0" />
                  <span className="text-sm text-zinc-500">MFA not enabled</span>
                </>
              )}
            </div>
            {user.lastLoginAt && (
              <p className="text-xs text-zinc-600 px-1">
                Last login: {new Date(user.lastLoginAt).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-zinc-600 px-1">
              Account created: {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </section>
        </div>

        {/* ── sticky footer ── */}
        <div className="shrink-0 px-6 py-4 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || (newPwd.length > 0 && newPwd.length < 10)}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
