import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Laptop2,
  Loader2,
  Monitor,
  Network,
  Printer,
  RefreshCw,
  Smartphone,
  Search,
  ShieldOff,
  Tv2,
  Wifi,
  X,
  XCircle,
} from "lucide-react";
import type { AdminDeviceSummary, DeviceType } from "@app/shared";
import { ApiCallError } from "../api/client";
import {
  decideAdminDevice,
  listAdminDevices,
  listUserDevicesForAdmin,
} from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";
import { playNotificationSound } from "../hooks/useNotificationSound";
import { useSSE } from "../hooks/useSSE";

type DeviceTab    = "pending" | "devices" | "blocked";
type DeviceFilter = "all" | "pending" | "approved" | "rejected";
type Decision     = "approved" | "rejected" | "blocked";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function DeviceStatusPill({ status }: { status: AdminDeviceSummary["status"] }) {
  const styles: Record<string, string> = {
    pending:  "border-amber-500/20  bg-amber-500/10  text-amber-200",
    approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    rejected: "border-rose-500/20   bg-rose-500/10   text-rose-200",
    blocked:  "border-slate-500/20  bg-slate-500/10  text-slate-300",
  };
  const dots: Record<string, string> = {
    pending: "bg-amber-400", approved: "bg-emerald-400",
    rejected: "bg-rose-400", blocked: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${styles[status] ?? ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status] ?? "bg-slate-400"}`} />
      {status}
    </span>
  );
}

function DeviceTypeIcon({ type }: { type: DeviceType }) {
  const icons: Record<DeviceType, LucideIcon> = {
    laptop:  Laptop2,
    mobile:  Smartphone,
    tablet:  Monitor,
    iot:     Wifi,
    printer: Printer,
    network: Network,
    gaming:  Monitor,
    tv:      Tv2,
    unknown: Smartphone,
  };
  const colors: Record<DeviceType, string> = {
    laptop: "text-sky-300", mobile: "text-violet-300", tablet: "text-indigo-300",
    iot: "text-amber-300", printer: "text-stone-300", network: "text-teal-300",
    gaming: "text-pink-300", tv: "text-orange-300", unknown: "text-slate-400",
  };
  const Icon = icons[type] ?? Smartphone;
  return <Icon className={`h-4.5 w-4.5 ${colors[type] ?? "text-slate-400"}`} />;
}

function DeviceTypeBadge({ type, manufacturer }: { type: DeviceType; manufacturer: string | null }) {
  if (type === "unknown" && !manufacturer) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400">
      {manufacturer ? manufacturer.split(" ").slice(0, 2).join(" ") : type}
    </span>
  );
}

function StatTile({ label, value, hint, icon: Icon, accent = "neutral" }: {
  label: string; value: number; hint: string; icon: LucideIcon;
  accent?: "neutral" | "amber" | "emerald" | "rose" | "slate";
}) {
  const iconBg: Record<string, string> = {
    neutral: "bg-white/[0.05] text-slate-300",
    amber:   "bg-amber-500/10  text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
    rose:    "bg-rose-500/10   text-rose-300",
    slate:   "bg-slate-500/10  text-slate-400",
  };
  return (
    <div className="app-card-dark p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
          <div className="mt-3 text-2xl font-semibold tabular-nums text-white">{value}</div>
          <div className="mt-2 text-sm text-slate-500">{hint}</div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg[accent]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

function DeviceAuthMethod({ device }: { device: Pick<AdminDeviceSummary, "certFingerprint"> }) {
  if (device.certFingerprint) return <>EAP-TLS · <code className="font-mono">{device.certFingerprint.slice(0, 12)}…</code></>;
  return <>PEAP / password auth</>;
}

// ── Action Buttons ────────────────────────────────────────────────────────────

function ActionButtons({ device, busy, onInspect, onDecision, showInspect = true }: {
  device: AdminDeviceSummary;
  busy: boolean;
  onInspect: () => void;
  onDecision: (status: Decision) => void;
  showInspect?: boolean;
}) {
  const isBlocked  = device.status === "blocked";
  const isApproved = device.status === "approved";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showInspect && (
        <button onClick={onInspect}
          className="rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.06] hover:text-white">
          Inspect
        </button>
      )}

      {/* Accept — only when not already approved */}
      {!isApproved && !isBlocked && (
        <button onClick={() => onDecision("approved")} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[18px] bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Accept
        </button>
      )}

      {/* Reject — only when not rejected or blocked */}
      {device.status !== "rejected" && !isBlocked && (
        <button onClick={() => onDecision("rejected")} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[18px] bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Reject
        </button>
      )}

      {/* Block — not shown for already blocked */}
      {!isBlocked && (
        <button onClick={() => onDecision("blocked")} disabled={busy}
          title="Permanently ban this MAC — it can never request access again"
          className="inline-flex items-center gap-1.5 rounded-[18px] bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          Block
        </button>
      )}

      {/* Unblock — shown only for blocked devices */}
      {isBlocked && (
        <button onClick={() => onDecision("rejected")} disabled={busy}
          title="Remove permanent ban — device will be able to re-request access"
          className="inline-flex items-center gap-1.5 rounded-[18px] border border-white/8 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
          Unblock
        </button>
      )}
    </div>
  );
}

// ── Device Card (mobile) ──────────────────────────────────────────────────────

function DeviceCard({ device, busy, onInspect, onDecision }: {
  device: AdminDeviceSummary; busy: boolean;
  onInspect: () => void; onDecision: (s: Decision) => void;
}) {
  return (
    <div className="app-card-dark p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[20px] bg-sky-400/[0.12] text-sky-200">
          <DeviceTypeIcon type={device.deviceType} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onInspect}
              className="text-left text-base font-semibold tracking-tight text-white transition hover:text-sky-200">
              {device.label || "Unnamed device"}
            </button>
            <DeviceStatusPill status={device.status} />
            <DeviceTypeBadge type={device.deviceType} manufacturer={device.manufacturer} />
          </div>
          <div className="mt-1.5 text-sm text-slate-400">
            {device.username}{device.fullName ? ` · ${device.fullName}` : ""}
          </div>
          <div className="mt-1.5 font-mono text-xs uppercase tracking-wide text-slate-500">
            {device.mac}
          </div>
          {device.lastIp && (
            <div className="mt-1 text-xs text-slate-500">IP: <span className="font-mono">{device.lastIp}</span></div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            <div>First seen {formatTimestamp(device.learnedAt)}</div>
            <div>Last seen {formatTimestamp(device.lastSeenAt)}</div>
          </div>
          {device.decisionNote && (
            <div className="mt-2 rounded-[16px] border border-white/6 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
              {device.decisionNote}
            </div>
          )}
          <div className="mt-3">
            <ActionButtons device={device} busy={busy} onInspect={onInspect} onDecision={onDecision} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function LiveDeviceApprovalsView() {
  const { token } = useAuth();
  const [tab, setTab]       = useState<DeviceTab>("pending");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [query, setQuery]   = useState("");
  const [devices, setDevices]   = useState<AdminDeviceSummary[]>([]);
  const [overview, setOverview] = useState<AdminDeviceSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<{
    id: string; username: string; fullName: string | null;
    devices: AdminDeviceSummary[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice]   = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const status =
        tab === "pending" ? "pending"
        : tab === "blocked" ? "blocked"
        : filter === "all" ? undefined
        : filter;

      const [overviewResult, deviceResult] = await Promise.all([
        listAdminDevices(token, { pageSize: 200 }),
        listAdminDevices(token, { pageSize: 100, status, search: query || undefined }),
      ]);
      setOverview(overviewResult.items);
      setDevices(deviceResult.items);
      setNotice((cur) => (cur?.ok ? cur : null));
    } catch (err) {
      setNotice({ ok: false, text: err instanceof ApiCallError ? err.payload.message : "Unable to load devices" });
    } finally {
      setLoading(false);
    }
  }, [filter, query, tab, token]);

  useEffect(() => { void load(); }, [load]);

  useSSE(token, {
    "device.pending": () => { playNotificationSound(); void load(); },
    "device.decided": () => { playNotificationSound(); void load(); },
  });

  const counts = useMemo(() =>
    overview.reduce((acc, d) => {
      acc.total += 1; acc[d.status] += 1; return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, blocked: 0 }),
    [overview],
  );

  const inspectUser = async (device: AdminDeviceSummary) => {
    if (!token) return;
    try {
      const result = await listUserDevicesForAdmin(token, device.userId, { pageSize: 100 });
      setSelectedUser({ id: device.userId, username: device.username, fullName: device.fullName, devices: result.items });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof ApiCallError ? err.payload.message : "Unable to load user devices" });
    }
  };

  const refreshSelectedUser = useCallback(async (device: AdminDeviceSummary) => {
    if (!token || selectedUser?.id !== device.userId) return;
    const updated = await listUserDevicesForAdmin(token, device.userId, { pageSize: 100 });
    setSelectedUser({ id: device.userId, username: device.username, fullName: device.fullName, devices: updated.items });
  }, [selectedUser?.id, token]);

  const decide = async (device: AdminDeviceSummary, status: Decision) => {
    if (!token) return;
    setBusyId(device.id);
    setNotice(null);
    try {
      const result = await decideAdminDevice(token, device.id, { status });
      const label = status === "blocked" ? "permanently blocked" : status;
      setNotice({
        ok: true,
        text: result.disconnectedSessions > 0
          ? `${device.mac} ${label}. Forced reauthentication for ${result.disconnectedSessions} session(s).`
          : `${device.mac} ${label}.`,
      });
      await load();
      await refreshSelectedUser(device);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof ApiCallError ? err.payload.message : `Unable to ${status} device` });
    } finally {
      setBusyId(null);
    }
  };

  const TABS = [
    { id: "pending" as DeviceTab,  label: "Pending queue",
      count: counts.pending > 0 ? counts.pending : undefined },
    { id: "devices" as DeviceTab,  label: "All devices" },
    { id: "blocked" as DeviceTab,  label: "Blocked",
      count: counts.blocked > 0 ? counts.blocked : undefined },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="theme-text-primary text-xl font-semibold tracking-tight lg:text-2xl">Device approvals</h2>
            <PageHelp
              title="Device Approvals"
              description="Three-state device decisions. Accept grants access, Reject lets the device re-apply next time it connects, Block permanently bans the MAC address."
              tips={[
                "Accept → device gets normal group policy on next auth",
                "Reject → device is denied now but can re-apply automatically when it reconnects",
                "Block → permanent ban — MAC is silently rejected forever, no re-registration",
                "Decisions trigger live CoA reauthentication if the device is already online",
              ]}
            />
          </div>
          <p className="theme-text-muted mt-1 max-w-3xl text-sm">
            Review first-seen devices and make access decisions. Three levels: Accept, Reject (can re-apply), or Block (permanent).
          </p>
        </div>
        <button onClick={load}
          className="theme-ghost-button inline-flex items-center justify-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pending"   value={counts.pending}  hint="Awaiting an operator decision"  icon={Clock3}     accent="amber"   />
        <StatTile label="Approved"  value={counts.approved} hint="Allowed onto the normal policy"  icon={CheckCircle2} accent="emerald" />
        <StatTile label="Rejected"  value={counts.rejected} hint="Denied — can re-apply on connect" icon={XCircle}    accent="rose"    />
        <StatTile label="Blocked"   value={counts.blocked}  hint="Permanently banned by MAC"        icon={ShieldOff}  accent="slate"   />
      </div>

      {notice && (
        <div className={`rounded-[24px] border px-4 py-4 text-sm ${
          notice.ok
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            : "border-rose-500/20 bg-rose-500/10 text-rose-200"
        }`}>
          {notice.text}
        </div>
      )}

      {/* Main panel */}
      <div className="app-card-dark overflow-hidden p-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-white/6 pb-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Tabs */}
          <div className="hide-scrollbar flex gap-2 overflow-x-auto rounded-[20px] bg-slate-950/55 p-1.5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`inline-flex min-w-max items-center gap-1.5 rounded-[16px] px-3 py-2 text-xs font-medium transition ${
                  tab === t.id ? "bg-sky-400 text-slate-950" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }`}>
                {t.label}
                {t.count !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    tab === t.id ? "bg-slate-950/30 text-slate-950" : "bg-amber-500/20 text-amber-300"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search user, MAC, label, manufacturer…"
                className="w-full rounded-[18px] border border-white/8 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40" />
            </div>
            {tab === "devices" && (
              <select value={filter} onChange={(e) => setFilter(e.target.value as DeviceFilter)}
                className="rounded-[18px] border border-white/8 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400/40">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="mt-4 space-y-4 lg:hidden">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} busy={busyId === device.id}
              onInspect={() => void inspectUser(device)}
              onDecision={(s) => void decide(device, s)} />
          ))}
          {!loading && devices.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
              No devices match the current filters.
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Device / User</th>
                <th className="px-4 py-3 font-medium">MAC · IP</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timeline</th>
                <th className="px-4 py-3 font-medium">Decision note</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {devices.map((device) => (
                <tr key={device.id} className="align-top transition hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-400/[0.12] text-sky-200">
                        <DeviceTypeIcon type={device.deviceType} />
                      </div>
                      <div className="min-w-0">
                        <button onClick={() => void inspectUser(device)}
                          className="text-left font-semibold text-white transition hover:text-sky-200">
                          {device.label || "Unnamed device"}
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <DeviceTypeBadge type={device.deviceType} manufacturer={device.manufacturer} />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {device.username}{device.fullName ? ` · ${device.fullName}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-mono text-xs uppercase tracking-wide text-slate-400">{device.mac}</div>
                    {device.lastIp && (
                      <div className="mt-1 font-mono text-xs text-slate-500">{device.lastIp}</div>
                    )}
                    <div className="mt-2 text-xs text-slate-500">
                      <DeviceAuthMethod device={device} />
                    </div>
                  </td>
                  <td className="px-4 py-4"><DeviceStatusPill status={device.status} /></td>
                  <td className="px-4 py-4 text-xs text-slate-400">
                    <div>First seen {formatTimestamp(device.learnedAt)}</div>
                    <div className="mt-1">Last seen {formatTimestamp(device.lastSeenAt)}</div>
                    {device.decidedAt && (
                      <div className="mt-1 text-slate-500">
                        Decided {formatTimestamp(device.decidedAt)}
                        {device.decidedBy ? ` by ${device.decidedBy}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500 leading-5">
                    {device.decisionNote || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <ActionButtons device={device} busy={busyId === device.id}
                        onInspect={() => void inspectUser(device)}
                        onDecision={(s) => void decide(device, s)} />
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && devices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No devices match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4 text-sm text-slate-500">
        <strong className="text-slate-300">Accept</strong> → full access · <strong className="text-slate-300">Reject</strong> → denied but can re-apply on next auth · <strong className="text-slate-300">Block</strong> → permanently banned, never re-registers
      </div>

      {selectedUser && (
        <UserDevicesModal user={selectedUser} onClose={() => setSelectedUser(null)}
          onDecision={decide} busyId={busyId} />
      )}
    </div>
  );
}

// ── User Device Inspector Modal ───────────────────────────────────────────────

function UserDevicesModal({ user, onClose, onDecision, busyId }: {
  user: { id: string; username: string; fullName: string | null; devices: AdminDeviceSummary[] };
  onClose: () => void;
  onDecision: (device: AdminDeviceSummary, status: Decision) => Promise<void>;
  busyId: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="surface-dark-strong w-full rounded-t-[32px] border-x-0 border-b-0 px-4 pb-5 pt-4 sm:max-w-4xl sm:rounded-[32px] sm:border sm:px-5 safe-bottom">
        <div className="flex items-center justify-between border-b border-white/6 pb-4">
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">
              {user.fullName || user.username}
            </div>
            <div className="mt-1 text-sm text-slate-500">{user.username} · all device records</div>
          </div>
          <button onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {user.devices.map((device) => (
            <div key={device.id} className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-400/[0.10] text-sky-200">
                  <DeviceTypeIcon type={device.deviceType} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{device.label || "Unnamed device"}</span>
                    <DeviceStatusPill status={device.status} />
                    <DeviceTypeBadge type={device.deviceType} manufacturer={device.manufacturer} />
                  </div>
                  <div className="mt-1.5 font-mono text-xs uppercase tracking-wide text-slate-500">{device.mac}</div>
                  {device.lastIp && (
                    <div className="mt-0.5 text-xs text-slate-500">IP: <span className="font-mono">{device.lastIp}</span></div>
                  )}
                  <div className="mt-1 text-xs text-slate-500">Last seen {formatTimestamp(device.lastSeenAt)}</div>
                  <div className="mt-3">
                    <ActionButtons device={device} busy={busyId === device.id}
                      onInspect={() => undefined} onDecision={(s) => void onDecision(device, s)}
                      showInspect={false} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {user.devices.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
              No devices recorded for this user yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
