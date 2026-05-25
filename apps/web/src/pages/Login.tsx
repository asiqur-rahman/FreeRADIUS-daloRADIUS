// ─────────────────────────────────────────────────────────────────────
//  Login screen. Dark, dense, matches the visual language of the
//  AdminDashboard mock so the two feel continuous.
// ─────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { ShieldCheck, Lock, User, Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ApiCallError } from "../api/client";

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login({ username, password });
    } catch (e) {
      const msg = e instanceof ApiCallError ? e.payload.message : "Login failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="text-base font-semibold">RADIUS Platform</div>
            <div className="text-[11px] text-slate-400">Enterprise WiFi management</div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-6 shadow-xl"
        >
          <h1 className="text-lg font-semibold mb-1">Sign in</h1>
          <p className="text-xs text-slate-400 mb-5">
            Use your platform credentials. Admin accounts require MFA when enabled.
          </p>

          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Username</label>
          <div className="relative mb-4">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              autoFocus
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            />
          </div>

          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Password</label>
          <div className="relative mb-5">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
            />
          </div>

          {err && (
            <div className="mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-medium text-sm py-2 transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Sign in
          </button>

          <p className="mt-4 text-[11px] text-slate-500 text-center">
            Trouble signing in? Contact your platform administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
