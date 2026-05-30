import { useDeferredValue, useEffect, useState } from "react";
import { Activity, Power, RefreshCw, Search } from "lucide-react";
import type { RadiusSession } from "@app/shared";
import { disconnectAdminSession, listAdminSessions } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

function formatBytes(value: string): string {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(value: string): string {
  const seconds = Number(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function LiveSessionsView() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<RadiusSession[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);

    listAdminSessions(token, { active: activeOnly, q: deferredQuery || undefined })
      .then((result) => {
        if (!cancelled) setSessions(result.items);
      })
      .catch((err: Error) => {
        if (!cancelled) setMessage({ ok: false, text: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOnly, deferredQuery, token]);

  const reload = async () => {
    if (!token) return;

    setLoading(true);

    try {
      const result = await listAdminSessions(token, {
        active: activeOnly,
        q: deferredQuery || undefined,
      });
      setSessions(result.items);
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Unable to load sessions",
      });
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async (session: RadiusSession) => {
    if (!token) return;

    setBusyId(session.id);
    setMessage(null);

    try {
      const response = await disconnectAdminSession(
        token,
        session.id,
        "Admin console disconnect",
      );
      setMessage({ ok: response.ok, text: response.result.message });
      await reload();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Disconnect failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">
              Accounting sessions
            </h2>
            <PageHelp
              title="Accounting Sessions"
              description="All active and recent RADIUS accounting sessions read directly from radacct. Operators can disconnect live sessions with an RFC 3576 Disconnect-Request."
              tips={[
                "Active only filters sessions with no Acct-Stop-Time recorded yet",
                "Disconnect sends a CoA Disconnect-Message to the configured NAS",
                "Search filters by username, MAC address, IP, or NAS identity",
              ]}
            />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Live radacct sessions with authenticated disconnect control for rapid response.
          </p>
        </div>

        <button
          onClick={reload}
          className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div
          className={`rounded-[24px] border px-4 py-4 text-sm ${
            message.ok
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="app-card-dark p-4">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username, MAC, IP, or NAS"
              className="w-full rounded-[20px] border border-white/8 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
            />
          </div>

          <div className="hide-scrollbar flex gap-2 overflow-x-auto rounded-[20px] bg-slate-950/55 p-1.5">
            <button
              onClick={() => setActiveOnly(true)}
              className={`min-w-max rounded-[16px] px-3 py-2 text-xs font-medium transition ${
                activeOnly
                  ? "bg-sky-400 text-slate-950"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveOnly(false)}
              className={`min-w-max rounded-[16px] px-3 py-2 text-xs font-medium transition ${
                !activeOnly
                  ? "bg-sky-400 text-slate-950"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              Recent history
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4 lg:hidden">
          {!loading && sessions.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
              No accounting sessions found.
            </div>
          )}

          {sessions.map((session) => {
            const active = session.stoppedAt === null;
            return (
              <div
                key={session.id}
                className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold tracking-tight text-white">
                      {session.username}
                    </div>
                    <div className="mt-1 font-mono text-xs uppercase tracking-wide text-slate-500">
                      {session.deviceLabel || session.callingStationId}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      active
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/[0.04] text-slate-300"
                    }`}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {active ? "active" : "ended"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                      NAS
                    </div>
                    <div className="mt-2 text-slate-300">
                      {session.nasName || session.nasIp}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {session.siteName || session.calledStationId || "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                      IP
                    </div>
                    <div className="mt-2 font-mono text-xs uppercase tracking-wide text-slate-400">
                      {session.framedIpAddress || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                      Traffic
                    </div>
                    <div className="mt-2 text-slate-300 tabular-nums">
                      {formatBytes(String(Number(session.inputOctets) + Number(session.outputOctets)))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
                      Duration
                    </div>
                    <div className="mt-2 text-slate-300 tabular-nums">
                      {formatDuration(session.durationSeconds)}
                    </div>
                  </div>
                </div>

                {active && (
                  <div className="mt-4">
                    <button
                      onClick={() => void disconnect(session)}
                      disabled={busyId === session.id}
                      className="inline-flex items-center gap-2 rounded-[18px] bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {busyId === session.id ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User / device</th>
                <th className="px-4 py-3 font-medium">NAS / site</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Traffic</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No accounting sessions found.
                  </td>
                </tr>
              )}
              {sessions.map((session) => {
                const active = session.stoppedAt === null;

                return (
                  <tr key={session.id} className="align-top transition hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{session.username}</div>
                      <div className="mt-1 font-mono text-xs uppercase tracking-wide text-slate-500">
                        {session.deviceLabel || session.callingStationId}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-slate-300">{session.nasName || session.nasIp}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {session.siteName || session.calledStationId || "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs uppercase tracking-wide text-slate-400">
                      {session.framedIpAddress || "-"}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-300">
                      {formatBytes(String(Number(session.inputOctets) + Number(session.outputOctets)))}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-300">
                      {formatDuration(session.durationSeconds)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          active
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                            : "border-white/10 bg-white/[0.04] text-slate-300"
                        }`}
                      >
                        <Activity className="h-3.5 w-3.5" />
                        {active ? "active" : "ended"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {active && (
                        <button
                          onClick={() => void disconnect(session)}
                          disabled={busyId === session.id}
                          className="rounded-[16px] p-2 text-slate-400 transition hover:bg-rose-500/12 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Disconnect session"
                        >
                          <Power className="h-4.5 w-4.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
