import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, RefreshCw, Server, Shield, Users, Wifi } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OperationalAlert, OperationsOverview } from "@app/shared";
import { getOperationsOverview } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Users; color: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
      <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="text-3xl font-semibold text-white tabular-nums">{value}</div>
      <div className="text-xs text-zinc-400 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: OperationalAlert }) {
  const critical = alert.severity === "critical";
  const Icon = critical ? AlertTriangle : AlertCircle;
  return (
    <div className="flex gap-3 py-3 border-b border-zinc-800/70 last:border-b-0">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${critical ? "text-rose-400" : "text-amber-400"}`} />
      <div>
        <div className="text-sm text-zinc-100 font-medium">{alert.title}</div>
        <div className="text-xs text-zinc-500 mt-1">{alert.detail}</div>
      </div>
    </div>
  );
}

export function LiveOperationsOverview() {
  const { token } = useAuth();
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setData(await getOperationsOverview(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operational metrics");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (data?.authenticationTrend ?? []).map((point) => ({
    ...point,
    time: new Date(point.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Operations Overview</h2>
            <PageHelp title="Operations Overview" description="Real-time RADIUS infrastructure health at a glance. Shows authentication success/reject trends, live session counts, NAS device health, certificate expiry warnings, and operational alerts — all auto-refreshed via server-sent events." tips={["Auth trend shows accept vs reject rates over the last 24 hours across all SSIDs", "Reject spikes trigger automatic alerts when they exceed the threshold set in Settings", "Certificate expiry warnings appear 30 days before the server cert expires — renew before the deadline to avoid authentication failures"]} />
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">Live RADIUS accounting, authentication, and certificate signals</p>
        </div>
        <button onClick={load} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-800 bg-rose-950/30 text-rose-300 px-4 py-3 text-sm">{error}</div>}

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Users" value={String(data?.activeUsers ?? "-")} color="bg-emerald-600" />
        <StatCard icon={Wifi} label="Live Sessions" value={String(data?.activeSessions ?? "-")} color="bg-sky-600" />
        <StatCard icon={Shield} label="Auth Success 24H" value={data?.authSuccessRate24h == null ? "-" : `${data.authSuccessRate24h}%`} color="bg-indigo-600" />
        <StatCard icon={Server} label="NAS Enabled" value={data ? `${data.enabledNas}/${data.totalNas}` : "-"} color="bg-amber-600" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Authentication Activity</h3>
          <p className="text-xs text-zinc-500 mb-4">Accepts and rejects from `radpostauth`, last 24 hours</p>
          <div className="h-60">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="accepts" stroke="#10b981" fill="#10b98133" strokeWidth={2} />
                  <Area type="monotone" dataKey="rejects" stroke="#f43f5e" fill="#f43f5e22" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-500">No authentication records in the last 24 hours.</div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white">Active Alerts</h3>
          <p className="text-xs text-zinc-500 mt-1 mb-3">Derived from current operational data</p>
          {data?.alerts.length ? data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />) : (
            <div className="text-sm text-emerald-400 py-6">No active operational alerts.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Active Sessions by Site</h3>
          <div className="space-y-3">
            {(data?.sessionsBySite ?? []).map((site) => (
              <div key={site.site} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{site.site}</span>
                <span className="text-zinc-100 font-medium tabular-nums">{site.sessions}</span>
              </div>
            ))}
            {data?.sessionsBySite.length === 0 && <p className="text-sm text-zinc-500">No active sessions.</p>}
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Reject Replies, 24H</h3>
          <div className="space-y-3">
            {(data?.rejectReasons ?? []).map((reason) => (
              <div key={reason.reason} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 truncate mr-3">{reason.reason}</span>
                <span className="text-rose-400 font-medium tabular-nums">{reason.count}</span>
              </div>
            ))}
            {data?.rejectReasons.length === 0 && <p className="text-sm text-zinc-500">No rejects recorded.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
