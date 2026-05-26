import { useDeferredValue, useEffect, useState } from "react";
import { Activity, Power, RefreshCw, Search } from "lucide-react";
import type { RadiusSession } from "@app/shared";
import { useAuth } from "../auth/AuthContext";
import { disconnectAdminSession, listAdminSessions } from "../api/endpoints";

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
      const result = await listAdminSessions(token, { active: activeOnly, q: deferredQuery || undefined });
      setSessions(result.items);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Unable to load sessions" });
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async (session: RadiusSession) => {
    if (!token) return;
    setBusyId(session.id);
    setMessage(null);
    try {
      const response = await disconnectAdminSession(token, session.id, "Admin console disconnect");
      setMessage({ ok: response.ok, text: response.result.message });
      await reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Disconnect failed" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Accounting Sessions</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Live `radacct` records with authenticated CoA disconnect control
          </p>
        </div>
        <button
          onClick={reload}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-rose-800 bg-rose-950/30 text-rose-300"}`}>
          {message.text}
        </div>
      )}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search username, MAC, IP, or NAS"
            className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-600"
          />
        </div>
        <button
          onClick={() => setActiveOnly(true)}
          className={`px-3 py-2 rounded-lg text-xs ${activeOnly ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}
        >
          Active
        </button>
        <button
          onClick={() => setActiveOnly(false)}
          className={`px-3 py-2 rounded-lg text-xs ${!activeOnly ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}
        >
          Recent history
        </button>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              <th className="px-4 py-3 font-medium">User / Device</th>
              <th className="px-4 py-3 font-medium">NAS / Site</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Traffic</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {!loading && sessions.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-zinc-500" colSpan={7}>
                  No accounting sessions found.
                </td>
              </tr>
            )}
            {sessions.map((session) => {
              const active = session.stoppedAt === null;
              return (
                <tr key={session.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="text-zinc-100 font-medium">{session.username}</div>
                    <div className="text-xs text-zinc-500 font-mono">{session.deviceLabel || session.callingStationId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-zinc-300">{session.nasName || session.nasIp}</div>
                    <div className="text-xs text-zinc-500">{session.siteName || session.calledStationId || "Unassigned"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{session.framedIpAddress || "-"}</td>
                  <td className="px-4 py-3 text-zinc-300 tabular-nums">
                    {formatBytes(String(Number(session.inputOctets) + Number(session.outputOctets)))}
                  </td>
                  <td className="px-4 py-3 text-zinc-300 tabular-nums">{formatDuration(session.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] ${active ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                      <Activity className="w-3 h-3" />
                      {active ? "active" : "ended"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {active && (
                      <button
                        onClick={() => disconnect(session)}
                        disabled={busyId === session.id}
                        className="p-1.5 hover:bg-rose-500/20 rounded text-zinc-500 hover:text-rose-400 disabled:opacity-50"
                        title="Disconnect session"
                      >
                        <Power className="w-4 h-4" />
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
  );
}
