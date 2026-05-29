// ─────────────────────────────────────────────────────────────────────────────
//  CreateUserDrawer — full-featured "New User" slide-in panel.
//  Matches the field set of UserEditDrawer so admins never have to
//  immediately re-open edit just to set role, multiple groups, or expiry.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  Eye, EyeOff, RefreshCw, ShieldCheck, User, X,
} from "lucide-react";
import type { GroupSummary, UserRole, UserSummary } from "@app/shared";
import { createUser } from "../api/endpoints";

// ── helpers ───────────────────────────────────────────────────────────────────

function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
        {label}
        {hint && <span className="ml-1.5 normal-case text-zinc-600 tracking-normal font-normal">{hint}</span>}
      </label>
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

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  groups: GroupSummary[];
  token: string;
  onClose: () => void;
  onCreated: (user: UserSummary) => void;
}

export function CreateUserDrawer({ groups, token, onClose, onCreated }: Props) {
  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [fullName, setFullName]   = useState("");
  const [password, setPassword]   = useState(randomPassword());
  const [showPwd, setShowPwd]     = useState(false);
  const [role, setRole]           = useState<UserRole>("guest");
  const [status, setStatus]       = useState<"active" | "pending">("active");
  const [groupIds, setGroupIds]   = useState<string[]>([]);
  const [validFrom, setValidFrom]   = useState("");
  const [validUntil, setValidUntil] = useState("");

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select default groups
  useEffect(() => {
    const defaults = groups.filter((g) => g.isDefault).map((g) => g.id);
    if (defaults.length) setGroupIds(defaults);
  }, [groups]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const toggleGroup = (id: string) =>
    setGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleCreate = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Username, email, and password are required");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
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
        validFrom:  validFrom  ? new Date(validFrom).toISOString()  : null,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-[520px] bg-zinc-900 border-l border-zinc-700 flex flex-col shadow-2xl">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">New User</div>
              <div className="text-xs text-zinc-500">Set all options before creating</div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* scrollable body */}
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
                placeholder="e.g. john.doe"
                autoFocus
                pattern="^[a-zA-Z0-9._-]+$"
                minLength={2}
                maxLength={64}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  maxLength={254}
                />
              </Field>

              <Field label="Full name" hint="(optional)">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  maxLength={120}
                />
              </Field>
            </div>
          </section>

          {/* ── Access & role ── */}
          <section className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Access</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  <option value="guest">Guest — WiFi access only</option>
                  <option value="user">User — portal + self-service</option>
                  <option value="admin">Admin — full management</option>
                </Select>
              </Field>

              <Field label="Initial status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as "active" | "pending")}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Valid from" hint="(optional)">
                <Input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="[color-scheme:dark]"
                />
              </Field>

              <Field label="Valid until" hint="(optional)">
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
            <div>
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">
                RADIUS Policy Groups
              </h3>
              <p className="text-xs text-zinc-600 mt-1">
                Groups control WiFi session policies (bandwidth, VLAN, timeout). Different from role.
              </p>
            </div>
            {groups.length === 0 ? (
              <p className="text-sm text-zinc-600">No groups defined yet — create one in Groups.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto -mx-1 px-1">
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
                      <div className="text-sm text-zinc-200 flex items-center gap-2">
                        {g.name}
                        {g.isDefault && (
                          <span className="text-[10px] text-indigo-400 border border-indigo-700 px-1.5 py-0.5 rounded-full">default</span>
                        )}
                      </div>
                      {g.description && <div className="text-xs text-zinc-500 truncate">{g.description}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* ── Password ── */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Password</h3>
            <p className="text-xs text-zinc-600">
              This password is used for PEAP-MSCHAPv2 WiFi login and the user portal. Share it with the user — they can change it from their portal.
            </p>

            <Field label="Temporary password">
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  maxLength={256}
                  className="pr-16"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPassword(randomPassword())}
                    className="p-1 text-zinc-500 hover:text-indigo-400 transition-colors"
                    title="Generate password"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </Field>
          </section>
        </div>

        {/* footer */}
        <div className="shrink-0 px-6 py-4 border-t border-zinc-800 flex items-center gap-3">
          <button
            onClick={() => void handleCreate()}
            disabled={busy || !username.trim() || !email.trim() || !password.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {busy
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <ShieldCheck className="w-4 h-4" />
            }
            Create User
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          {role === "admin" && (
            <span className="ml-auto text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-1 rounded-lg">
              Admin — full access
            </span>
          )}
          {role === "guest" && (
            <span className="ml-auto text-xs text-sky-400 bg-sky-950/40 border border-sky-800/50 px-2 py-1 rounded-lg">
              Guest — WiFi only, no portal login
            </span>
          )}
        </div>
      </div>
    </>
  );
}
