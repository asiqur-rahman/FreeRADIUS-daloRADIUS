// ─────────────────────────────────────────────────────────────────────
//  Typed fetch wrapper with automatic token refresh on 401.
//
//  Token storage lives in AuthContext (never localStorage).
//  On 401 the client calls a registered refresh callback, obtains a
//  fresh token, and replays the original request exactly once.
//  Concurrent 401s are coalesced — the refresh happens once and all
//  pending requests are replayed together.
// ─────────────────────────────────────────────────────────────────────
import type { ApiError } from "@app/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  /** Internal — set to true on the retry so we never loop. */
  _retry?: boolean;
}

export class ApiCallError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiError,
  ) {
    super(payload.message);
    this.name = "ApiCallError";
  }
}

// ── Single-flight refresh ──────────────────────────────────────────────────
// A callback registered by AuthContext. Returns the new access token or null.
type RefreshFn = () => Promise<string | null>;
let _refreshFn: RefreshFn | null = null;
let _refreshing: Promise<string | null> | null = null;

/** Call once from AuthContext after each successful login / refresh. */
export function setRefreshCallback(fn: RefreshFn | null): void {
  _refreshFn = fn;
}

function doRefresh(): Promise<string | null> {
  if (_refreshing) return _refreshing;
  if (!_refreshFn) return Promise.resolve(null);
  _refreshing = _refreshFn().finally(() => { _refreshing = null; });
  return _refreshing;
}

// ── Core fetch ─────────────────────────────────────────────────────────────
export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method:      opts.method ?? "GET",
    headers,
    body:        opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal:      opts.signal,
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    // ── Automatic token refresh on 401 ──────────────────────────────
    if (res.status === 401 && !opts._retry && _refreshFn) {
      const newToken = await doRefresh();
      if (newToken) {
        return api<T>(path, { ...opts, token: newToken, _retry: true });
      }
    }

    const payload: ApiError =
      data && typeof data === "object" && "error" in data
        ? (data as ApiError)
        : { error: "unknown", message: res.statusText };
    throw new ApiCallError(res.status, payload);
  }

  return data as T;
}
