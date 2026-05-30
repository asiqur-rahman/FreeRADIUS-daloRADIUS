import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { GroupSummary, UserRole, UserSummary } from "@app/shared";
import { createUser } from "../api/endpoints";
import { useTheme } from "../theme/ThemeContext";

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
  groups: GroupSummary[];
  token: string;
  onClose: () => void;
  onCreated: (user: UserSummary) => void;
}

export function CreateUserDrawer({ groups, token, onClose, onCreated }: Props) {
  const { isWhiteTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [showPwd, setShowPwd] = useState(false);
  const [role, setRole] = useState<UserRole>("user");
  const [status, setStatus] = useState<"active" | "pending">("active");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const defaults = groups.filter((group) => group.isDefault).map((group) => group.id);
    if (defaults.length) setGroupIds(defaults);
  }, [groups]);

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

  const toggleGroup = (id: string) => {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const handleCreate = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Username, email, and password are required.");
      return;
    }

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const created = await createUser(token, {
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        fullName: fullName.trim() || undefined,
        password,
        role,
        status,
        groupIds: groupIds.length ? groupIds : undefined,
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`fixed inset-0 z-40 backdrop-blur-sm ${isWhiteTheme ? "bg-slate-900/25" : "bg-slate-950/72"}`}
        aria-label="Close create user panel"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 top-auto h-[92vh] sm:inset-y-3 sm:right-3 sm:left-auto sm:h-auto sm:w-full sm:max-w-[560px]">
        <div className={`${isWhiteTheme ? "theme-surface-strong" : "surface-dark-strong"} flex h-full flex-col rounded-t-[32px] border-x-0 border-b-0 shadow-[0_28px_80px_rgba(2,6,23,0.42)] sm:rounded-[32px] sm:border safe-bottom`}>
          <div className={`flex items-center justify-between border-b px-5 pb-4 pt-4 sm:px-6 sm:pt-5 ${isWhiteTheme ? "border-slate-200" : "border-white/6"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-400 text-slate-950 shadow-lg shadow-sky-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  New user
                </div>
                <div className={`mt-1 text-lg font-semibold tracking-tight ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>
                  Create account
                </div>
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

            <Section eyebrow="Identity" title="Who is this for?" light={isWhiteTheme}>
              <Field label="Username" light={isWhiteTheme}>
                <Input
                  light={isWhiteTheme}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="john.doe"
                  autoFocus
                  pattern="^[a-zA-Z0-9._-]+$"
                  minLength={2}
                  maxLength={64}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="user@company.com"
                    maxLength={254}
                  />
                </Field>

                <Field label="Name" hint="Optional" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Jane Smith"
                    maxLength={120}
                  />
                </Field>
              </div>
            </Section>

            <Section eyebrow="Access" title="Role and dates" light={isWhiteTheme}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" light={isWhiteTheme}>
                  <Select light={isWhiteTheme} value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>

                <Field label="Status" light={isWhiteTheme}>
                  <Select
                    light={isWhiteTheme}
                    value={status}
                    onChange={(event) => setStatus(event.target.value as "active" | "pending")}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start" hint="Optional" light={isWhiteTheme}>
                  <Input
                    light={isWhiteTheme}
                    type="datetime-local"
                    value={validFrom}
                    onChange={(event) => setValidFrom(event.target.value)}
                    className="[color-scheme:dark]"
                  />
                </Field>

                <Field label="End" hint="Optional" light={isWhiteTheme}>
                  <div className="flex items-center gap-2">
                    <Input
                      light={isWhiteTheme}
                      type="datetime-local"
                      value={validUntil}
                      onChange={(event) => setValidUntil(event.target.value)}
                      className="[color-scheme:dark]"
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

            <Section eyebrow="Groups" title="Policy" light={isWhiteTheme}>
              {groups.length === 0 ? (
                <div className={`rounded-[22px] border border-dashed px-4 py-5 text-sm ${isWhiteTheme ? "border-slate-200 bg-white/80 text-slate-500" : "border-white/8 bg-white/[0.03] text-slate-500"}`}>
                  No groups yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-[22px] border px-4 py-3 transition ${
                        groupIds.includes(group.id)
                          ? "border-sky-400/20 bg-sky-400/[0.08]"
                          : isWhiteTheme
                            ? "border-slate-200 bg-white/80 hover:bg-white"
                            : "border-white/6 bg-white/[0.03] hover:bg-white/[0.05]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={groupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`text-sm font-medium ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>{group.name}</div>
                          {group.isDefault && (
                            <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-sky-200">
                              Default
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <div className={`mt-1 text-xs ${isWhiteTheme ? "text-slate-600" : "text-slate-500"}`}>{group.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </Section>

            <Section eyebrow="Password" title="Set a password" description="Used for portal and PEAP sign-in." light={isWhiteTheme}>
              <Field label="Password" light={isWhiteTheme}>
                <div className="relative">
                  <Input
                    light={isWhiteTheme}
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={10}
                    maxLength={256}
                    className="pr-24"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPassword(randomPassword())}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-sky-600" : "text-slate-500 hover:bg-white/[0.05] hover:text-sky-200"}`}
                      title="Generate password"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPwd((current) => !current)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-slate-950" : "text-slate-500 hover:bg-white/[0.05] hover:text-white"}`}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </Field>

              <div className={`rounded-[22px] border px-4 py-3 text-sm ${isWhiteTheme ? "border-slate-200 bg-white/80 text-slate-600" : "border-white/6 bg-white/[0.03] text-slate-500"}`}>
                Share it once. The user can change it later.
              </div>
            </Section>
          </div>

          <div className={`border-t px-4 pb-4 pt-4 sm:px-6 ${isWhiteTheme ? "border-slate-200" : "border-white/6"}`}>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className={`text-xs ${isWhiteTheme ? "text-slate-500" : "text-slate-500"}`}>
                {role === "admin" ? "Admin access enabled." : "Portal access ready."}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className={`rounded-[18px] border px-4 py-3 text-sm font-medium transition ${isWhiteTheme ? "border-slate-200 text-slate-600 hover:bg-white hover:text-slate-950" : "border-white/8 text-slate-300 hover:bg-white/[0.05] hover:text-white"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={busy || !username.trim() || !email.trim() || !password.trim()}
                  className="inline-flex items-center gap-2 rounded-[18px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {busy ? "Creating..." : "Create user"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
