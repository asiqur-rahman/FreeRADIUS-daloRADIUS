import { type FormEvent, useState } from "react";
import { KeyRound, Loader2, Lock, ShieldCheck, User } from "lucide-react";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../theme/ThemeContext";

const highlights = [
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
];

export function Login() {
  const { login } = useAuth();
  const { isWhiteTheme } = useTheme();
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

  const titleClass = isWhiteTheme ? "text-slate-950" : "text-white";
  const copyClass = isWhiteTheme ? "text-slate-600" : "text-slate-400";

  return (
    <div className={`min-h-screen bg-transparent px-4 py-6 ${isWhiteTheme ? "text-slate-900" : "text-slate-100"}`}>
      <div className="mx-auto flex min-h-screen max-w-6xl items-center">
        <div className="grid w-full gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="theme-surface-strong hidden min-h-[680px] flex-col justify-between rounded-[36px] px-8 py-8 lg:flex">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 text-slate-950 shadow-lg shadow-sky-500/20">
                    <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
                  </div>
                  <div>
                    <div className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
                      Nexara
                    </div>
                    <div className={`mt-1 text-base font-semibold tracking-tight ${titleClass}`}>
                      Enterprise Wi-Fi Access Control
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <PwaInstallButton />
                  <ThemeToggle />
                </div>
              </div>

              <div className="mt-10 max-w-xl">
                <div className="text-[11px] uppercase tracking-[0.3em] text-sky-500">
                  Secure operator workspace
                </div>
                <h1 className={`font-display mt-4 max-w-lg text-5xl font-semibold leading-[1.02] tracking-tight ${titleClass}`}>
                  Run approvals, policy, and RADIUS operations from one console.
                </h1>
                <p className={`mt-5 max-w-xl text-base leading-7 ${copyClass}`}>
                  Designed for modern WPA2-Enterprise and WPA3-Enterprise workflows with
                  device approvals, active session control, and auditable operator actions.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.label} className="theme-soft-card rounded-[26px] px-4 py-4">
                  <div className="theme-text-faint text-[11px] uppercase tracking-[0.24em]">
                    {item.label}
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${titleClass}`}>{item.value}</div>
                  <div className={`mt-2 text-sm ${copyClass}`}>{item.description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="theme-surface-strong mx-auto w-full max-w-md rounded-[36px] px-6 py-7 sm:px-7 sm:py-8 lg:max-w-none lg:px-8 lg:py-9">
            <div className="mb-7 flex items-center justify-between gap-3 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 text-slate-950 shadow-lg shadow-sky-500/20">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
                    Nexara
                  </div>
                  <div className={`mt-1 text-base font-semibold tracking-tight ${titleClass}`}>
                    Enterprise Wi-Fi Access
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PwaInstallButton compact />
                <ThemeToggle compact />
              </div>
            </div>

            <div className="mb-7 hidden justify-end gap-2 lg:flex">
              <PwaInstallButton />
              <ThemeToggle />
            </div>

            <div className="mb-7">
              <div className="text-[11px] uppercase tracking-[0.28em] text-sky-500">Sign in</div>
              <h2 className={`mt-3 text-3xl font-semibold tracking-tight ${titleClass}`}>
                Access your workspace
              </h2>
              <p className={`mt-2 text-sm leading-6 ${copyClass}`}>
                Use your platform credentials. If your account has MFA enabled, enter the
                six-digit authenticator code as well.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="theme-text-faint mb-2 block text-[11px] font-medium uppercase tracking-[0.24em]">
                  Username
                </span>
                <div className="theme-input flex items-center gap-3 rounded-[22px] px-4 py-3">
                  <User className="theme-text-faint h-4.5 w-4.5" />
                  <input
                    autoFocus
                    required
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="theme-text-primary w-full bg-transparent text-sm outline-none"
                    placeholder="Enter your username"
                  />
                </div>
              </label>

              <label className="block">
                <span className="theme-text-faint mb-2 block text-[11px] font-medium uppercase tracking-[0.24em]">
                  Password
                </span>
                <div className="theme-input flex items-center gap-3 rounded-[22px] px-4 py-3">
                  <Lock className="theme-text-faint h-4.5 w-4.5" />
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="theme-text-primary w-full bg-transparent text-sm outline-none"
                    placeholder="Enter your password"
                  />
                </div>
              </label>

              <label className="block">
                <span className="theme-text-faint mb-2 block text-[11px] font-medium uppercase tracking-[0.24em]">
                  Authenticator code
                </span>
                <div className="theme-input flex items-center gap-3 rounded-[22px] px-4 py-3">
                  <KeyRound className="theme-text-faint h-4.5 w-4.5" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(event) =>
                      setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="theme-text-primary w-full bg-transparent text-sm tracking-[0.3em] outline-none placeholder:tracking-normal"
                    placeholder="Optional if disabled"
                  />
                </div>
              </label>

              {err && (
                <div className={`rounded-[22px] border px-4 py-3 text-sm ${isWhiteTheme ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
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

            <div className="theme-soft-card mt-6 rounded-[24px] px-4 py-4">
              <div className="theme-text-faint text-[11px] uppercase tracking-[0.24em]">
                Support
              </div>
              <p className={`mt-2 text-sm leading-6 ${copyClass}`}>
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
