import { type FormEvent, useState } from "react";
import { KeyRound, Loader2, Lock, ShieldCheck, User } from "lucide-react";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      await login({ username, password, totpCode: totpCode || undefined });
    } catch (error) {
      setErr(error instanceof ApiCallError ? error.payload.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center">
        <div className="grid w-full gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="surface-dark-strong hidden min-h-[680px] flex-col justify-between rounded-[36px] px-8 py-8 lg:flex">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 text-slate-950 shadow-lg shadow-sky-500/20">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    RadiusOps
                  </div>
                  <div className="mt-1 text-base font-semibold tracking-tight text-white">
                    Enterprise Wi-Fi Access Control
                  </div>
                </div>
              </div>

              <div className="mt-10 max-w-xl">
                <div className="text-[11px] uppercase tracking-[0.3em] text-sky-300">
                  Secure operator workspace
                </div>
                <h1 className="mt-4 max-w-lg text-5xl font-semibold tracking-tight text-white font-display leading-[1.02]">
                  Run approvals, policy, and RADIUS operations from one console.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                  Designed for modern WPA2-Enterprise and WPA3-Enterprise workflows with
                  device approvals, active session control, and auditable operator actions.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Protected sign-in",
                  value: "MFA ready",
                  description: "TOTP can be enforced for operator accounts.",
                },
                {
                  label: "Control plane",
                  value: "Live actions",
                  description: "Disconnect sessions and review pending devices in real time.",
                },
                {
                  label: "Design language",
                  value: "Mobile first",
                  description: "Optimized for laptops and phone-sized operator checks.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[26px] border border-white/6 bg-white/[0.03] px-4 py-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {item.label}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                  <div className="mt-2 text-sm text-slate-400">{item.description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-dark-strong mx-auto w-full max-w-md rounded-[36px] px-6 py-7 sm:px-7 sm:py-8 lg:max-w-none lg:px-8 lg:py-9">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 text-slate-950 shadow-lg shadow-sky-500/20">
                <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  RadiusOps
                </div>
                <div className="mt-1 text-base font-semibold tracking-tight text-white">
                  Enterprise Wi-Fi Access
                </div>
              </div>
            </div>

            <div className="mb-7">
              <div className="text-[11px] uppercase tracking-[0.28em] text-sky-300">
                Sign in
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Access your workspace
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Use your platform credentials. If your account has MFA enabled, enter the
                six-digit authenticator code as well.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                  Username
                </span>
                <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-slate-950/70 px-4 py-3 transition focus-within:border-sky-400/50 focus-within:ring-2 focus-within:ring-sky-400/15">
                  <User className="h-4.5 w-4.5 text-slate-500" />
                  <input
                    autoFocus
                    required
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    placeholder="Enter your username"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                  Password
                </span>
                <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-slate-950/70 px-4 py-3 transition focus-within:border-sky-400/50 focus-within:ring-2 focus-within:ring-sky-400/15">
                  <Lock className="h-4.5 w-4.5 text-slate-500" />
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    placeholder="Enter your password"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                  Authenticator code
                </span>
                <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-slate-950/70 px-4 py-3 transition focus-within:border-sky-400/50 focus-within:ring-2 focus-within:ring-sky-400/15">
                  <KeyRound className="h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(event) =>
                      setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="w-full bg-transparent text-sm tracking-[0.3em] text-slate-100 outline-none placeholder:tracking-normal placeholder:text-slate-600"
                    placeholder="Optional if disabled"
                  />
                </div>
              </label>

              {err && (
                <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in
              </button>
            </form>

            <div className="mt-6 rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Support
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                If you cannot sign in, contact your platform administrator. Device approval
                requests and Wi-Fi access decisions are managed after login.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
