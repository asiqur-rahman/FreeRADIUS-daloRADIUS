import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Shield,
  Users,
  Wifi,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OperationalAlert, OperationsOverview } from "@app/shared";
import { getOperationsOverview } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="app-card-dark p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-white tabular-nums">
            {value}
          </div>
          <div className="mt-2 text-sm text-slate-500">{hint}</div>
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: OperationalAlert }) {
  const isCritical = alert.severity === "critical";
  const Icon = isCritical ? AlertTriangle : AlertCircle;

  return (
    <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${
            isCritical
              ? "bg-rose-500/12 text-rose-300"
              : "bg-amber-500/12 text-amber-300"
          }`}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`text-[11px] uppercase tracking-[0.24em] ${
              isCritical ? "text-rose-300" : "text-amber-300"
            }`}
          >
            {alert.severity}
          </div>
          <div className="mt-2 text-sm font-medium text-white">{alert.title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-500">{alert.detail}</div>
        </div>
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
    time: new Date(point.hour).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="theme-text-primary text-xl font-semibold tracking-tight lg:text-2xl">
              Operations overview
            </h2>
            <PageHelp
              title="Operations Overview"
              description="Real-time RADIUS infrastructure health at a glance. Shows authentication success and reject trends, live session counts, NAS device health, certificate expiry warnings, and derived operational alerts."
              tips={[
                "Auth trend shows accept versus reject volume over the last 24 hours across all SSIDs",
                "Reject spikes trigger automatic alerts when they exceed the threshold set in Settings",
                "Certificate expiry warnings appear before the server EAP certificate reaches its cutoff date",
              ]}
            />
          </div>
          <p className="theme-text-muted mt-1 max-w-3xl text-sm">
            Live authentication telemetry, alert context, and RADIUS service posture in one
            operator-friendly view.
          </p>
        </div>

        <button
          onClick={load}
          className="theme-ghost-button inline-flex items-center justify-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-[24px] border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Active users"
          value={String(data?.activeUsers ?? "-")}
          hint="Identities seen across live sessions"
          accent="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
        <StatCard
          icon={Wifi}
          label="Live sessions"
          value={String(data?.activeSessions ?? "-")}
          hint="Current radacct sessions in progress"
          accent="bg-gradient-to-br from-sky-500 to-cyan-500"
        />
        <StatCard
          icon={Shield}
          label="24h success"
          value={data?.authSuccessRate24h == null ? "-" : `${data.authSuccessRate24h}%`}
          hint="Successful authentications over 24 hours"
          accent="bg-gradient-to-br from-indigo-500 to-sky-500"
        />
        <StatCard
          icon={Server}
          label="Enabled NAS"
          value={data ? `${data.enabledNas}/${data.totalNas}` : "-"}
          hint="Configured clients allowed to send RADIUS"
          accent="bg-gradient-to-br from-amber-500 to-orange-500"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr),minmax(320px,0.95fr)]">
        <section className="app-card-dark p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                Authentication activity
              </div>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Accepts and rejects over the last 24 hours
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Accepts
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Rejects
              </span>
            </div>
          </div>

          <div className="mt-5 h-72">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="acceptGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rejectGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(148, 163, 184, 0.12)"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(7, 17, 28, 0.94)",
                      border: "1px solid rgba(148, 163, 184, 0.18)",
                      borderRadius: 18,
                      fontSize: 12,
                      color: "#e2e8f0",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accepts"
                    stroke="#34d399"
                    fill="url(#acceptGradient)"
                    strokeWidth={2.4}
                  />
                  <Area
                    type="monotone"
                    dataKey="rejects"
                    stroke="#fb7185"
                    fill="url(#rejectGradient)"
                    strokeWidth={2.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] text-sm text-slate-500">
                No authentication records in the last 24 hours.
              </div>
            )}
          </div>
        </section>

        <section className="app-card-dark p-5">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            Active alerts
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">
            Issues requiring operator attention
          </h3>
          <div className="mt-5 space-y-3">
            {data?.alerts.length ? (
              data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
            ) : (
              <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-5 text-sm text-emerald-200">
                No active operational alerts.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="app-card-dark p-5">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            Active sessions by site
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">
            Location-level demand snapshot
          </h3>
          <div className="mt-5 space-y-3">
            {(data?.sessionsBySite ?? []).map((site) => (
              <div
                key={site.site}
                className="flex items-center justify-between rounded-[22px] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <span className="text-slate-300">{site.site}</span>
                <span className="font-semibold tabular-nums text-white">{site.sessions}</span>
              </div>
            ))}
            {data?.sessionsBySite.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-500">
                No active sessions.
              </div>
            )}
          </div>
        </section>

        <section className="app-card-dark p-5">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            Reject replies
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">
            Most common 24-hour reject reasons
          </h3>
          <div className="mt-5 space-y-3">
            {(data?.rejectReasons ?? []).map((reason) => (
              <div
                key={reason.reason}
                className="flex items-center justify-between rounded-[22px] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <span className="mr-4 min-w-0 truncate text-slate-300">
                  {reason.reason}
                </span>
                <span className="font-semibold tabular-nums text-rose-300">
                  {reason.count}
                </span>
              </div>
            ))}
            {data?.rejectReasons.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-500">
                No rejects recorded.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
