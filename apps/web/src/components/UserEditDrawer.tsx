import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  ShieldOff,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type {
  GroupSummary,
  ProvisionUserCertResponse,
  UserClientCert,
  UserRole,
  UserStatus,
  UserSummary,
} from "@app/shared";
import { listUserCerts, provisionUserCert, revokeUserCert, updateUser } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function Section({
  eyebrow,
  title,
  description,
  light,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  light: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[28px] border px-4 py-4 ${light ? "border-slate-200 bg-slate-50/90" : "border-white/8 bg-white/[0.03]"}`}>
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{eyebrow}</div>
        <div className={`mt-2 text-base font-semibold tracking-tight ${light ? "text-slate-950" : "text-white"}`}>{title}</div>
        {description && <div className={`mt-1 text-sm ${light ? "text-slate-600" : "text-slate-500"}`}>{description}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  light,
  children,
}: {
  label: string;
  hint?: string;
  light: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
          {label}
        </label>
        {hint && <span className={`text-xs ${light ? "text-slate-500" : "text-slate-600"}`}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ light = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { light?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full rounded-[20px] border px-4 py-3 text-sm outline-none transition focus:border-sky-400/40 ${
        light
          ? "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:bg-white"
          : "border-white/8 bg-slate-950/70 text-white placeholder:text-slate-600 focus:bg-slate-950/90"
      } ${props.className ?? ""}`}
    />
  );
}

function Select({ light = false, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { light?: boolean }) {
  return (
    <select
      {...props}
      className={`w-full rounded-[20px] border px-4 py-3 text-sm outline-none transition focus:border-sky-400/40 ${
        light
          ? "border-slate-200 bg-white text-slate-950 focus:bg-white"
          : "border-white/8 bg-slate-950/70 text-white focus:bg-slate-950/90"
      } ${props.className ?? ""}`}
    />
  );
}

interface Props {
  user: UserSummary;
  groups: GroupSummary[];
  token: string;
  onClose: () => void;
  onSaved: (updated: UserSummary) => void;
}

export function UserEditDrawer({ user, groups, token, onClose, onSaved }: Props) {
  const { isWhiteTheme } = useTheme();
  const { user: currentUser } = useAuth();
  // Backend enforces these; frontend disables the controls for clarity
  const isSelf = currentUser?.id === user.id;

  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [validFrom, setValidFrom] = useState(toLocal(user.validFrom));
  const [validUntil, setValidUntil] = useState(toLocal(user.validUntil));
  // Single-group: a user belongs to at most one group at a time
  const [groupId,     setGroupId]     = useState<string>(user.groups[0]?.id ?? "");
  const [certEnabled, setCertEnabled] = useState<boolean>(user.certEnabled);

  const [newPwd, setNewPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [savedPwd, setSavedPwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [certs, setCerts] = useState<UserClientCert[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certBundle, setCertBundle] = useState<ProvisionUserCertResponse | null>(null);
  const [certBundleCopied, setCertBundleCopied] = useState(false);
  const [provisioningCert, setProvisioningCert] = useState(false);

  const loadCerts = useCallback(async () => {
    if (!token) return;
    setCertsLoading(true);
    try {
      const list = await listUserCerts(token, user.id);
      setCerts(list);
    } catch {
      // ignore drawer-local cert loading errors
    } finally {
      setCertsLoading(false);
    }
  }, [token, user.id]);

  useEffect(() => {
    void loadCerts();
  }, [loadCerts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const selectGroup = (id: string) => setGroupId(id);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const usernameChanged = username.toLowerCase() !== user.username;

  const handleProvisionCert = async () => {
    setProvisioningCert(true);
    setError(null);
    try {
      const bundle = await provisionUserCert(token, user.id, {});
      setCertBundle(bundle);
      await loadCerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate provisioning failed.");
    } finally {
      setProvisioningCert(false);
    }
  };

  const handleRevokeCert = async (certId: string) => {
    try {
      await revokeUserCert(token, user.id, certId);
      await loadCerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed.");
    }
  };

  const downloadPkcs12 = (bundle: ProvisionUserCertResponse) => {
    const bytes = Uint8Array.from(atob(bundle.pkcs12Base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/x-pkcs12" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${user.username}-wifi.p12`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!username.trim() || !email.trim()) {
      setError("Username and email are required.");
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
        certEnabled,
        groupIds: groupId ? [groupId] : [],
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      };

      if (usernameChanged) body.username = username.trim().toLowerCase();
      if (newPwd) body.newPassword = newPwd;

      const updated = await updateUser(token, user.id, body);
      setSavedPwd(newPwd || null);
      setNewPwd("");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const titleClass = isWhiteTheme ? "text-slate-950" : "text-white";
  const copyClass = isWhiteTheme ? "text-slate-600" : "text-slate-500";
  const faintClass = "text-slate-500";
  const softCardClass = isWhiteTheme
    ? "border-slate-200 bg-white/80"
    : "border-white/8 bg-white/[0.03]";
  const ghostButtonClass = isWhiteTheme
    ? "border-slate-200 text-slate-600 hover:bg-white hover:text-slate-950"
    : "border-white/8 text-slate-300 hover:bg-white/[0.05] hover:text-white";
  const iconButtonClass = isWhiteTheme
    ? "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
    : "text-slate-500 hover:bg-white/[0.05] hover:text-white";

  return (
    <>
      <button
        className={`fixed inset-0 z-40 backdrop-blur-sm ${isWhiteTheme ? "bg-slate-900/25" : "bg-slate-950/72"}`}
        aria-label="Close edit user panel"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 top-auto h-[92vh] sm:inset-y-3 sm:right-3 sm:left-auto sm:h-auto sm:w-full sm:max-w-[560px]">
        <div className={`${isWhiteTheme ? "theme-surface-strong" : "surface-dark-strong"} flex h-full flex-col rounded-t-[32px] border-x-0 border-b-0 shadow-[0_28px_80px_rgba(2,6,23,0.42)] sm:rounded-[32px] sm:border safe-bottom`}>
          <div className={`flex items-center justify-between border-b px-5 pb-4 pt-4 sm:px-6 sm:pt-5 ${isWhiteTheme ? "border-slate-200" : "border-white/6"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-400 text-slate-950 shadow-lg shadow-sky-500/20">
                <User className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Edit user
                </div>
                <div className={`mt-1 text-lg font-semibold tracking-tight ${titleClass}`}>
                  {user.fullName || user.username}
                </div>
                <div className={`mt-1 text-xs ${faintClass}`}>@{user.username}</div>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${isWhiteTheme ? "border-slate-200 bg-white text-slate-500 hover:text-slate-950" : "border-white/8 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {error && (
              <div className={`rounded-[22px] border px-4 py-3 text-sm ${isWhiteTheme ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-500/20 bg-rose-500/10 text-rose-200"}`}>
                {error}
              </div>
            )}

            <Section eyebrow="Identity" title="Core details" light={isWhiteTheme}>
              <Field label="Username" light={isWhiteTheme}>
                <Input
                  light={isWhiteTheme}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  pattern="^[a-zA-Z0-9._-]+$"
                  minLength={2}
                  maxLength={64}
                />
                {usernameChanged && (
                  <div className={`rounded-[18px] border px-3 py-2 text-xs ${isWhiteTheme ? "border-amber-300 bg-amber-50 text-amber-700" : "border-amber-500/15 bg-amber-500/10 text-amber-200"}`}>
                    Renaming updates RADIUS records.
                  </div>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                  />
                </Field>

                <Field label="Name" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Optional"
                    maxLength={120}
                  />
                </Field>
              </div>
            </Section>

            <Section eyebrow="Access" title="Role and state" light={isWhiteTheme}>
              {isSelf && (
                <div className={`rounded-[18px] border px-3 py-2 text-xs ${isWhiteTheme ? "border-amber-300/40 bg-amber-50 text-amber-700" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                  Role and status cannot be changed for your own account.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" light={isWhiteTheme} hint={isSelf ? "Cannot edit own role" : undefined}>
                  <Select light={isWhiteTheme} value={role} disabled={isSelf}
                    onChange={(event) => setRole(event.target.value as UserRole)}
                    className={isSelf ? "opacity-50 cursor-not-allowed" : ""}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>

                <Field label="Status" light={isWhiteTheme} hint={isSelf ? "Cannot suspend own account" : undefined}>
                  <Select light={isWhiteTheme} value={status} disabled={isSelf}
                    onChange={(event) => setStatus(event.target.value as UserStatus)}
                    className={isSelf ? "opacity-50 cursor-not-allowed" : ""}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    type="datetime-local"
                    value={validFrom}
                    onChange={(event) => setValidFrom(event.target.value)}
                    className={isWhiteTheme ? "" : "[color-scheme:dark]"}
                  />
                </Field>

                <Field label="End" light={isWhiteTheme}>
                  <div className="flex items-center gap-2">
                    <Input
                      light={isWhiteTheme}
                      type="datetime-local"
                      value={validUntil}
                      onChange={(event) => setValidUntil(event.target.value)}
                      className={isWhiteTheme ? "" : "[color-scheme:dark]"}
                    />
                    {validUntil && (
                      <button
                        type="button"
                        onClick={() => setValidUntil("")}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${isWhiteTheme ? "border-slate-200 bg-white text-slate-500 hover:text-rose-500" : "border-white/8 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-rose-300"}`}
                        title="Clear end date"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            </Section>

            {/* ── Extra Config ── */}
            <Section eyebrow="Extra config" title="Feature access" light={isWhiteTheme}>
              <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border px-4 py-3.5 transition ${
                isWhiteTheme ? "border-slate-200 bg-white/80 hover:bg-white" : "border-white/6 bg-white/[0.03] hover:bg-white/[0.05]"
              }`}>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${isWhiteTheme ? "text-slate-900" : "text-white"}`}>
                    WiFi Certificate Access
                  </div>
                  <div className={`mt-0.5 text-xs ${isWhiteTheme ? "text-slate-500" : "text-slate-400"}`}>
                    {certEnabled
                      ? "User can generate and use EAP-TLS WiFi certificates"
                      : "Certificate generation is disabled — user must use password auth"}
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={certEnabled}
                  onClick={() => setCertEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${certEnabled ? "bg-sky-400" : isWhiteTheme ? "bg-slate-200" : "bg-white/10"}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${certEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </label>
            </Section>

            <Section eyebrow="Groups" title="Policy" light={isWhiteTheme}>
              {groups.length === 0 ? (
                <div className={`rounded-[22px] border border-dashed px-4 py-5 text-sm ${isWhiteTheme ? "border-slate-200 bg-white/80 text-slate-500" : "border-white/8 bg-white/[0.03] text-slate-500"}`}>
                  No groups yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* No group option */}
                  <label className={`flex cursor-pointer items-center gap-3 rounded-[22px] border px-4 py-3 transition ${
                    !groupId
                      ? "border-sky-400/20 bg-sky-400/[0.08]"
                      : isWhiteTheme
                        ? "border-slate-200 bg-white/80 hover:bg-white"
                        : "border-white/6 bg-white/[0.03] hover:bg-white/[0.05]"
                  }`}>
                    <input type="radio" name={`group-${user.id}`} checked={!groupId}
                      onChange={() => selectGroup("")}
                      className="h-4 w-4 shrink-0 accent-sky-400" />
                    <span className={`text-sm font-medium ${isWhiteTheme ? "text-slate-500" : "text-slate-400"}`}>No group</span>
                  </label>
                  {groups.map((group) => (
                    <label key={group.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-[22px] border px-4 py-3 transition ${
                        groupId === group.id
                          ? "border-sky-400/20 bg-sky-400/[0.08]"
                          : isWhiteTheme
                            ? "border-slate-200 bg-white/80 hover:bg-white"
                            : "border-white/6 bg-white/[0.03] hover:bg-white/[0.05]"
                      }`}>
                      <input type="radio" name={`group-${user.id}`}
                        checked={groupId === group.id}
                        onChange={() => selectGroup(group.id)}
                        className="h-4 w-4 shrink-0 accent-sky-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isWhiteTheme ? "text-slate-900" : "text-white"}`}>{group.name}</span>
                          {group.isDefault && (
                            <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-sky-200">
                              Default
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <div className={`mt-0.5 text-xs ${isWhiteTheme ? "text-slate-500" : "text-slate-400"}`}>{group.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </Section>

            <Section eyebrow="Password" title="Reset password" description="Leave blank to keep the current one." light={isWhiteTheme}>
              {savedPwd ? (
                <div className="space-y-3">
                  <div className={`rounded-[20px] border px-4 py-3 text-sm ${isWhiteTheme ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-emerald-500/18 bg-emerald-500/10 text-emerald-200"}`}>
                    New password saved.
                  </div>
                  <div className={`flex items-center gap-2 rounded-[20px] border px-4 py-3 ${isWhiteTheme ? "border-slate-200 bg-white" : "border-white/8 bg-slate-950/70"}`}>
                    <span className={`min-w-0 flex-1 break-all font-mono text-sm ${titleClass}`}>
                      {showPwd ? savedPwd : "•".repeat(savedPwd.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPwd((current) => !current)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${iconButtonClass}`}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(savedPwd)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-emerald-600" : "text-slate-500 hover:bg-white/[0.05] hover:text-emerald-300"}`}
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      light={isWhiteTheme}
                      type={showPwd ? "text" : "password"}
                      value={newPwd}
                      onChange={(event) => setNewPwd(event.target.value)}
                      placeholder="New password"
                      minLength={10}
                      maxLength={256}
                      className="pr-24"
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPwd((current) => !current)}
                        className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${iconButtonClass}`}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        title="Generate password"
                        onClick={() => {
                          const generated = randomPassword();
                          setNewPwd(generated);
                          setShowPwd(true);
                        }}
                        className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-sky-600" : "text-slate-500 hover:bg-white/[0.05] hover:text-sky-200"}`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {newPwd && newPwd.length < 10 && (
                    <div className={`text-xs ${isWhiteTheme ? "text-rose-600" : "text-rose-300"}`}>Minimum 10 characters.</div>
                  )}
                </div>
              )}
            </Section>

            <Section eyebrow="Certificates" title="Wi-Fi certs" description="For EAP-TLS access." light={isWhiteTheme}>
              <div className="flex items-center justify-between gap-3">
                <div className={`text-sm ${copyClass}`}>Provision once, download once.</div>
                <button
                  type="button"
                  onClick={handleProvisionCert}
                  disabled={provisioningCert}
                  className="inline-flex items-center gap-1.5 rounded-[18px] border border-sky-400/18 bg-sky-400/[0.08] px-3 py-2 text-xs font-medium text-sky-200 transition hover:bg-sky-400/[0.12] disabled:opacity-50"
                >
                  {provisioningCert ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Provision
                </button>
              </div>

              {certBundle && (
                <div className={`space-y-3 rounded-[22px] border px-4 py-4 ${isWhiteTheme ? "border-emerald-300 bg-emerald-50" : "border-emerald-500/18 bg-emerald-500/10"}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${isWhiteTheme ? "text-emerald-700" : "text-emerald-200"}`}>
                    <Sparkles className="h-4 w-4" />
                    Certificate ready
                  </div>
                  <div className={`break-all text-xs font-mono ${isWhiteTheme ? "text-slate-700" : "text-slate-300"}`}>
                    {certBundle.commonName}
                  </div>
                  <div className={`text-xs ${isWhiteTheme ? "text-slate-500" : "text-slate-400"}`}>
                    Expires {new Date(certBundle.expiresAt).toLocaleDateString()}
                  </div>
                  <div className={`flex items-center gap-2 rounded-[18px] border px-3 py-2 ${isWhiteTheme ? "border-slate-200 bg-white" : "border-white/8 bg-slate-950/55"}`}>
                    <span className={`min-w-0 flex-1 truncate text-xs font-mono ${isWhiteTheme ? "text-slate-700" : "text-slate-300"}`}>
                      {certBundle.pkcs12Password}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(certBundle.pkcs12Password);
                        setCertBundleCopied(true);
                        setTimeout(() => setCertBundleCopied(false), 2000);
                      }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-emerald-600" : "text-slate-500 hover:bg-white/[0.05] hover:text-emerald-300"}`}
                    >
                      {certBundleCopied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadPkcs12(certBundle)}
                      className="rounded-[18px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:brightness-105"
                    >
                      Download .p12
                    </button>
                    <button
                      type="button"
                      onClick={() => setCertBundle(null)}
                      className={`rounded-[18px] border px-3 py-2.5 text-xs font-medium transition ${isWhiteTheme ? "border-slate-200 text-slate-600 hover:bg-white hover:text-slate-950" : "border-white/8 text-slate-300 hover:bg-white/[0.05] hover:text-white"}`}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {certsLoading ? (
                <div className={`text-sm ${copyClass}`}>Loading...</div>
              ) : certs.length === 0 ? (
                <div className={`rounded-[22px] border border-dashed px-4 py-5 text-sm ${isWhiteTheme ? "border-slate-200 bg-white/80 text-slate-500" : "border-white/8 bg-white/[0.03] text-slate-500"}`}>
                  No certificates.
                </div>
              ) : (
                <div className="space-y-2">
                  {certs.map((cert) => {
                    const revoked = Boolean(cert.revokedAt);
                    return (
                      <div
                        key={cert.id}
                        className={`flex items-center gap-3 rounded-[22px] border px-4 py-3 ${
                          revoked
                            ? isWhiteTheme
                              ? "border-slate-200 bg-slate-50/70 opacity-55"
                              : "border-white/6 bg-white/[0.02] opacity-55"
                            : isWhiteTheme
                              ? "border-slate-200 bg-white/80"
                              : "border-white/8 bg-white/[0.03]"
                        }`}
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${revoked ? isWhiteTheme ? "bg-slate-100 text-slate-500" : "bg-white/[0.03] text-slate-600" : "bg-sky-400/[0.08] text-sky-200"}`}>
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-mono text-xs ${isWhiteTheme ? "text-slate-700" : "text-slate-300"}`}>{cert.commonName}</div>
                          <div className={`mt-1 text-xs ${faintClass}`}>
                            {revoked
                              ? `Revoked ${new Date(cert.revokedAt!).toLocaleDateString()}`
                              : `Expires ${new Date(cert.expiresAt).toLocaleDateString()}`}
                          </div>
                        </div>
                        {!revoked ? (
                          <button
                            type="button"
                            title="Revoke certificate"
                            onClick={() => void handleRevokeCert(cert.id)}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-rose-50 hover:text-rose-600" : "text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section eyebrow="Security" title="Sign-in state" light={isWhiteTheme}>
              <div className={`rounded-[22px] border px-4 py-4 ${softCardClass}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-slate-100" : "bg-white/[0.04]"}`}>
                    {user.mfaEnabled ? (
                      <Shield className="h-4.5 w-4.5 text-emerald-300" />
                    ) : (
                      <ShieldOff className="h-4.5 w-4.5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${titleClass}`}>
                      {user.mfaEnabled ? "MFA enabled" : "MFA off"}
                    </div>
                    <div className={`mt-1 text-xs ${faintClass}`}>
                      {user.lastLoginAt
                        ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}`
                        : "No recent login"}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`text-xs ${faintClass}`}>
                Created {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </Section>
          </div>

          <div className={`border-t px-4 pb-4 pt-4 sm:px-6 ${isWhiteTheme ? "border-slate-200" : "border-white/6"}`}>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className={`text-xs ${faintClass}`}>
                {role === "admin" ? "Admin access enabled." : "User access enabled."}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-[18px] border px-4 py-3 text-sm font-medium transition ${ghostButtonClass}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || (newPwd.length > 0 && newPwd.length < 10)}
                  className="inline-flex items-center gap-2 rounded-[18px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  {busy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
