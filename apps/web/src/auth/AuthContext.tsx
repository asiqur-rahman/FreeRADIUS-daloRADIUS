// ─────────────────────────────────────────────────────────────────────
//  Auth context — holds the access token in memory (never localStorage)
//  and exposes login/logout.
//
//  On mount, attempts /auth/refresh — the HttpOnly refresh cookie
//  survives page reloads, so a logged-in session is restored.
//
//  Proactive refresh: after each login/refresh the JWT exp is decoded
//  and a timer is set to silently refresh ~2 min before the token
//  expires.  This keeps the session alive without any visible flicker.
//
//  401 interceptor: the API client is given a refresh callback so any
//  request that slips through with an expired token (e.g. tab was
//  backgrounded) is retried automatically with a fresh token.
// ─────────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import type { LoginRequest, LoginResponse, UserSummary } from "@app/shared";
import { api, setRefreshCallback } from "../api/client";

interface AuthState {
  user:   UserSummary | null;
  token:  string | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface AuthApi extends AuthState {
  login:  (req: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

// ── JWT helpers ────────────────────────────────────────────────────────────
function jwtExp(token: string): number | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Milliseconds until 2 minutes before the token expires (min 10 s). */
function msUntilRefresh(token: string): number {
  const exp = jwtExp(token);
  if (!exp) return 10_000;
  const msLeft = exp * 1_000 - Date.now() - 2 * 60 * 1_000;
  return Math.max(msLeft, 10_000);
}

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, status: "loading" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Clear existing refresh timer ───────────────────────────────────
  const clearRefreshTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Schedule the next proactive refresh ───────────────────────────
  const scheduleRefresh = useCallback(
    (token: string) => {
      clearRefreshTimer();
      const delay = msUntilRefresh(token);
      timerRef.current = setTimeout(() => {
        // Fire-and-forget; errors are swallowed — the 401 interceptor
        // in client.ts acts as a safety net if this somehow fails.
        api<LoginResponse>("/api/v1/auth/refresh", { method: "POST" })
          .then((r) => {
            setState({ user: r.user, token: r.accessToken, status: "authenticated" });
          })
          .catch(() => {
            // Refresh failed — the user will see a 401 on their next
            // action and be directed to the login page.
            setState({ user: null, token: null, status: "anonymous" });
            setRefreshCallback(null);
          });
      }, delay);
    },
    [clearRefreshTimer],
  );

  // ── Apply a successful auth response ──────────────────────────────
  const applyAuth = useCallback(
    (r: LoginResponse) => {
      setState({ user: r.user, token: r.accessToken, status: "authenticated" });
      scheduleRefresh(r.accessToken);
      // Give the API client a way to refresh on 401 without cycling
      // through React state.
      setRefreshCallback(async () => {
        try {
          const fresh = await api<LoginResponse>("/api/v1/auth/refresh", { method: "POST" });
          setState({ user: fresh.user, token: fresh.accessToken, status: "authenticated" });
          scheduleRefresh(fresh.accessToken);
          return fresh.accessToken;
        } catch {
          setState({ user: null, token: null, status: "anonymous" });
          setRefreshCallback(null);
          return null;
        }
      });
    },
    [scheduleRefresh],
  );

  // ── Mount: restore session from the HttpOnly refresh cookie ───────
  useEffect(() => {
    let alive = true;
    api<LoginResponse>("/api/v1/auth/refresh", { method: "POST" })
      .then((r) => { if (alive) applyAuth(r); })
      .catch(() => {
        if (alive) setState({ user: null, token: null, status: "anonymous" });
      });
    return () => {
      alive = false;
      clearRefreshTimer();
      setRefreshCallback(null);
    };
  }, [applyAuth, clearRefreshTimer]);

  // ── login ──────────────────────────────────────────────────────────
  const login = useCallback(
    async (req: LoginRequest) => {
      const r = await api<LoginResponse>("/api/v1/auth/login", { method: "POST", body: req });
      applyAuth(r);
    },
    [applyAuth],
  );

  // ── logout ─────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearRefreshTimer();
    setRefreshCallback(null);
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clearing local state is what matters.
    }
    setState({ user: null, token: null, status: "anonymous" });
  }, [clearRefreshTimer]);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth used outside AuthProvider");
  return v;
}
