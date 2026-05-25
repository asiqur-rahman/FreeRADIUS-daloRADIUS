// ─────────────────────────────────────────────────────────────────────
//  Tiny typed fetch wrapper. No SWR/React Query for Phase 1 — keep the
//  surface small. Token storage lives in AuthContext; this module only
//  knows how to build requests.
// ─────────────────────────────────────────────────────────────────────
import type { ApiError } from "@app/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
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

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const payload: ApiError =
      data && typeof data === "object" && "error" in data
        ? (data as ApiError)
        : { error: "unknown", message: res.statusText };
    throw new ApiCallError(res.status, payload);
  }

  return data as T;
}
