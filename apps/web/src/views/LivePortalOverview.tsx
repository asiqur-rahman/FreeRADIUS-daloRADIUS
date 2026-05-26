import { useEffect, useState } from "react";
import { Activity, Clock, Laptop, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import type { RadiusSession, UserDevice } from "@app/shared";
import { listMyDevices, listMySessions } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

function duration(seconds: string): string {
  const total = Number(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function when(value: string | null): string {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function LivePortalOverview() {
  const { token, user } = useAuth();
  const [sessions, setSessions] = useState<RadiusSession[]>([]);
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([listMySessions(token), listMyDevices(token)])
      .then(([sessionResult, deviceResult]) => {
        if (!cancelled) {
          setSessions(sessionResult.items);
          setDevices(deviceResult);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const active = sessions.find((session) => session.stoppedAt === null);
  const recent = sessions.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className={`relative overflow-hidden rounded-3xl p-8 text-white ${active ? "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" : "bg-gradient-to-br from-stone-700 to-stone-900"}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-white/85">
            <div className={`w-2 h-2 rounded-full ${active ? "bg-white animate-pulse" : "bg-stone-400"}`} />
            <span className="text-xs font-semibold uppercase tracking-wider">{active ? "Connected" : "No active Wi-Fi session"}</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>
            {active ? "You're online." : "You're currently offline."}
          </h2>
          {active && (
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div><div className="text-[10px] uppercase tracking-wider text-white/70">Device</div><div className="text-base font-semibold mt-1">{active.deviceLabel || active.callingStationId}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-white/70">Access Point</div><div className="text-base font-semibold mt-1">{active.nasName || active.nasIp}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-white/70">IP Address</div><div className="text-base font-semibold mt-1 font-mono">{active.framedIpAddress || "-"}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-white/70">Session</div><div className="text-base font-semibold mt-1">{duration(active.durationSeconds)}</div></div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 mb-3" />
          <div className="text-2xl font-semibold text-stone-900">{user?.mfaEnabled ? "Enabled" : "Optional"}</div>
          <div className="text-xs text-stone-500 mt-1">Two-factor authentication</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <Smartphone className="w-5 h-5 text-sky-600 mb-3" />
          <div className="text-2xl font-semibold text-stone-900">{devices.length} devices</div>
          <div className="text-xs text-stone-500 mt-1">Registered for network access</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <Activity className="w-5 h-5 text-amber-600 mb-3" />
          <div className="text-2xl font-semibold text-stone-900">{sessions.filter((session) => session.stoppedAt === null).length}</div>
          <div className="text-xs text-stone-500 mt-1">Current RADIUS sessions</div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-stone-900 mb-4" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Recent network sessions</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-stone-500">No accounting activity recorded yet.</p>
        ) : recent.map((session) => (
          <div key={session.id} className="flex items-center gap-3 py-3 border-b last:border-b-0 border-stone-100">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${session.stoppedAt ? "bg-stone-100 text-stone-500" : "bg-emerald-50 text-emerald-600"}`}>
              {session.stoppedAt ? <Laptop className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-stone-900">{session.deviceLabel || session.callingStationId}</div>
              <div className="text-xs text-stone-500">{session.nasName || session.nasIp}</div>
            </div>
            <div className="text-xs text-stone-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {when(session.updatedAt || session.startedAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
