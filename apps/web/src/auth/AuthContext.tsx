// ─────────────────────────────────────────────────────────────────────
//  Auth context — holds the access token in memory (never localStorage,
//  per the architecture doc's threat model) and exposes login/logout.
//
//  On mount, attempts /auth/refresh — the HttpOnly refresh cookie
//  survives page reloads, so a logged-in session is restored.
// ─────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LoginRequest, LoginResponse, UserSummary } from "@app/shared";
import { api } from "../api/client";

interface AuthState {
  user: UserSummary | null;
  token: string | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface AuthApi extends AuthState {
  login: (req: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, status: "loading" });

  // Try to restore the session on mount via the refresh cookie.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api<LoginResponse>("/api/v1/auth/refresh", { method: "POST" });
        if (alive) setState({ user: r.user, token: r.accessToken, status: "authenticated" });
      } catch {
        if (alive) setState({ user: null, token: null, status: "anonymous" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const r = await api<LoginResponse>("/api/v1/auth/login", { method: "POST", body: req });
    setState({ user: r.user, token: r.accessToken, status: "authenticated" });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clearing local state is what matters.
    }
    setState({ user: null, token: null, status: "anonymous" });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth used outside AuthProvider");
  return v;
}
