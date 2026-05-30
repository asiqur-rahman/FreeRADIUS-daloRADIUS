import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import type { AdminDeviceSummary, DeviceApprovalEntry } from "@app/shared";
import { ApiCallError } from "../api/client";
import {
  decideAdminDevice,
  listAdminDevices,
  listDeviceApprovals,
  listUserDevicesForAdmin,
} from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { PageHelp } from "../components/PageHelp";
import { playNotificationSound } from "../hooks/useNotificationSound";
import { useSSE } from "../hooks/useSSE";

type DeviceTab = "pending" | "devices" | "history";
type DeviceFilter = "all" | "pending" | "approved" | "rejected" | "blocked";

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DeviceStatusPill({ status }: { status: AdminDeviceSummary["status"] }) {
  const styles = {
    pending: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    rejected: "border-rose-500/20 bg-rose-500/10 text-rose-200",
    blocked: "border-slate-500/20 bg-slate-500/10 text-slate-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${styles[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "approved"
            ? "bg-emerald-400"
            : status === "rejected"
              ? "bg-rose-400"
              : "bg-amber-400"
        }`}
      />
      {status}
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className="app-card-dark p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {label}
          </div>
          <div className="mt-3 text-2xl font-semibold tabular-nums text-white">{value}</div>
          <div className="mt-2 text-sm text-slate-500">{hint}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-300">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

function DeviceMethodCopy(device: Pick<AdminDeviceSummary, "certFingerprint">) {
  if (device.certFingerprint) {
    return `EAP-TLS · cert ${device.certFingerprint.slice(0, 12)}…`;
  }

  return "PEAP / password auth";
}

function ActionButtons({
  device,
  busy,
  onInspect,
  onDecision,
  showInspect = true,
}: {
  device: AdminDeviceSummary;
  busy: boolean;
  onInspect: () => void;
  onDecision: (status: "approved" | "rejected") => void;
  showInspect?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showInspect && (
        <button
          onClick={onInspect}
          className="rounded-[18px] border border-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
        >
          Inspect
        </button>
      )}
      {device.status !== "approved" && (
        <button
          onClick={() => onDecision("approved")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[18px] bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Approve
        </button>
      )}
      {device.status !== "rejected" && (
        <button
          onClick={() => onDecision("rejected")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[18px] bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Reject
        </button>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  busy,
  onInspect,
  onDecision,
}: {
  device: AdminDeviceSummary;
  busy: boolean;
  onInspect: () => void;
  onDecision: (status: "approved" | "rejected") => void;
}) {
  return (
    <div className="app-card-dark p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-sky-400/[0.12] text-sky-200">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onInspect}
              className="text-left text-base font-semibold tracking-tight text-white transition hover:text-sky-200"
            >
              {device.label || "Unnamed device"}
            </button>
            <DeviceStatusPill status={device.status} />
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {device.username}
            {device.fullName ? ` · ${device.fullName}` : ""}
          </div>
          <div className="mt-2 font-mono text-xs uppercase tracking-wide text-slate-500">
            {device.mac}
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
            <div>Requested {formatTimestamp(device.learnedAt)}</div>
            <div>Last seen {formatTimestamp(device.lastSeenAt)}</div>
            <div>Learned {formatTimestamp(device.learnedAt)}</div>
            <div>{DeviceMethodCopy(device)}</div>
          </div>
          <div className="mt-3 rounded-[20px] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            {device.decisionNote || "No operator note yet."}
          </div>
          <div className="mt-4">
            <ActionButtons
              device={device}
              busy={busy}
              onInspect={onInspect}
              onDecision={onDecision}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveDeviceApprovalsView() {
  const { token } = useAuth();
  const [tab, setTab] = useState<DeviceTab>("pending");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [query, setQuery] = useState("");
  const [devices, setDevices] = useState<AdminDeviceSummary[]>([]);
  const [history, setHistory] = useState<DeviceApprovalEntry[]>([]);
  const [overview, setOverview] = useState<AdminDeviceSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    username: string;
    fullName: string | null;
    devices: AdminDeviceSummary[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const currentDeviceStatus =
        tab === "pending" ? "pending" : filter === "all" ? undefined : filter;

      const [overviewResult, deviceResult, historyResult] = await Promise.all([
        listAdminDevices(token, { pageSize: 200 }),
        listAdminDevices(token, {
          pageSize: 100,
          status: currentDeviceStatus,
          search: query || undefined,
        }),
        listDeviceApprovals(token, {
          pageSize: 100,
          status: tab === "history" && filter !== "all" ? filter : undefined,
          search: tab === "history" && query ? query : undefined,
        }),
      ]);

      setOverview(overviewResult.items);
      setDevices(deviceResult.items);
      setHistory(historyResult.items);
      setNotice((current) => (current?.ok ? current : null));
    } catch (err) {
      setNotice({
        ok: false,
        text:
          err instanceof ApiCallError
            ? err.payload.message
            : "Unable to load approval workspace",
      });
    } finally {
      setLoading(false);
    }
  }, [filter, query, tab, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useSSE(token, {
    "device.pending": () => {
      playNotificationSound();
      void load();
    },
    "device.decided": () => {
      playNotificationSound();
      void load();
    },
  });

  const counts = useMemo(
    () =>
      overview.reduce(
        (acc, device) => {
          acc.total += 1;
          acc[device.status] += 1;
          return acc;
        },
        { total: 0, pending: 0, approved: 0, rejected: 0, blocked: 0 },
      ),
    [overview],
  );

  const inspectUser = async (device: AdminDeviceSummary) => {
    if (!token) return;

    try {
      const result = await listUserDevicesForAdmin(token, device.userId, { pageSize: 100 });
      setSelectedUser({
        id: device.userId,
        username: device.username,
        fullName: device.fullName,
        devices: result.items,
      });
    } catch (err) {
      setNotice({
        ok: false,
        text:
          err instanceof ApiCallError
            ? err.payload.message
            : "Unable to load the user's devices",
      });
    }
  };

  const refreshSelectedUser = useCallback(
    async (device: AdminDeviceSummary) => {
      if (!token || selectedUser?.id !== device.userId) return;

      const updated = await listUserDevicesForAdmin(token, device.userId, { pageSize: 100 });
      setSelectedUser({
        id: device.userId,
        username: device.username,
        fullName: device.fullName,
        devices: updated.items,
      });
    },
    [selectedUser?.id, token],
  );

  const decide = async (device: AdminDeviceSummary, status: "approved" | "rejected") => {
    if (!token) return;

    setBusyId(device.id);
    setNotice(null);

    try {
      const result = await decideAdminDevice(token, device.id, { status });
      setNotice({
        ok: true,
        text:
          result.disconnectedSessions > 0
            ? `${device.mac} marked ${status}. Forced reauthentication for ${result.disconnectedSessions} active session(s).`
            : `${device.mac} marked ${status}. No active session needed reauthentication.`,
      });
      await load();
      await refreshSelectedUser(device);
    } catch (err) {
      setNotice({
        ok: false,
        text:
          err instanceof ApiCallError
            ? err.payload.message
            : `Unable to ${status} device`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const visibleHistory =
    tab === "history" && query
      ? history.filter((entry) => {
          const normalizedQuery = query.toLowerCase();

          return (
            entry.username.toLowerCase().includes(normalizedQuery) ||
            entry.mac.toLowerCase().includes(normalizedQuery) ||
            (entry.deviceLabel || "").toLowerCase().includes(normalizedQuery) ||
            (entry.notes || "").toLowerCase().includes(normalizedQuery)
          );
        })
      : history;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">
              Device approvals
            </h2>
            <PageHelp
              title="Device Approvals"
              description="First-seen device workflow. New devices enter Pending until an operator approves or rejects them. Decisions are written to the audit trail and can trigger live reauthentication when the device is already online."
              tips={[
                "Approval decisions are per device identity and MAC address, not just per user account",
                "Approving a device with an active session triggers immediate policy refresh where supported",
                "The queue updates in real time from server-sent events and Telegram-driven decisions",
              ]}
            />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Review first-seen devices, approve or reject them quickly, and keep a clean
            decision history for every operator action.
          </p>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Pending"
          value={counts.pending}
          hint="Needs an operator decision"
          icon={Clock3}
        />
        <StatTile
          label="Approved"
          value={counts.approved}
          hint="Allowed onto the normal policy path"
          icon={CheckCircle2}
        />
        <StatTile
          label="Rejected"
          value={counts.rejected}
          hint="Blocked at the approval layer"
          icon={XCircle}
        />
        <StatTile
          label="Known devices"
          value={counts.total}
          hint="All device identities on record"
          icon={ShieldCheck}
        />
      </div>

      {notice && (
        <div
          className={`rounded-[24px] border px-4 py-4 text-sm ${
            notice.ok
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="app-card-dark overflow-hidden p-4">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="hide-scrollbar flex gap-2 overflow-x-auto rounded-[20px] bg-slate-950/55 p-1.5">
            {[
              { id: "pending", label: "Pending queue" },
              { id: "devices", label: "All devices" },
              { id: "history", label: "Decision history" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as DeviceTab)}
                className={`min-w-max rounded-[16px] px-3 py-2 text-xs font-medium transition ${
                  tab === item.id
                    ? "bg-sky-400 text-slate-950"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:w-[18rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "history" ? "Search approvals..." : "Search user, MAC, or label..."}
                className="w-full rounded-[18px] border border-white/8 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
              />
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as DeviceFilter)}
              className="rounded-[18px] border border-white/8 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400/40"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </div>

        {(tab === "pending" || tab === "devices") && (
          <>
            <div className="mt-4 space-y-4 lg:hidden">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  busy={busyId === device.id}
                  onInspect={() => void inspectUser(device)}
                  onDecision={(status) => void decide(device, status)}
                />
              ))}
              {!loading && devices.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
                  No devices match the current filters.
                </div>
              )}
            </div>

            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">User / device</th>
                    <th className="px-4 py-3 font-medium">MAC</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Request timeline</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {devices.map((device) => (
                    <tr key={device.id} className="align-top transition hover:bg-white/[0.03]">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/[0.12] text-sky-200">
                            <Smartphone className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <button
                              onClick={() => void inspectUser(device)}
                              className="text-left font-semibold text-white transition hover:text-sky-200"
                            >
                              {device.label || "Unnamed device"}
                            </button>
                            <div className="mt-1 text-xs text-slate-500">
                              {device.username}
                              {device.fullName ? ` · ${device.fullName}` : ""}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Learned {formatTimestamp(device.learnedAt)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {DeviceMethodCopy(device)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs uppercase tracking-wide text-slate-400">
                        {device.mac}
                      </td>
                      <td className="px-4 py-4">
                        <DeviceStatusPill status={device.status} />
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400">
                        <div>Requested {formatTimestamp(device.learnedAt)}</div>
                        <div className="mt-2">Last seen {formatTimestamp(device.lastSeenAt)}</div>
                      </td>
                      <td className="px-4 py-4 text-xs leading-6 text-slate-500">
                        {device.decisionNote || "No operator note yet"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          <ActionButtons
                            device={device}
                            busy={busyId === device.id}
                            onInspect={() => void inspectUser(device)}
                            onDecision={(status) => void decide(device, status)}
                          />
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
          </>
        )}

        {tab === "history" && (
          <div className="mt-4 space-y-3">
            {visibleHistory.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl ${
                      entry.status === "approved"
                        ? "bg-emerald-500/12 text-emerald-200"
                        : entry.status === "rejected"
                          ? "bg-rose-500/12 text-rose-200"
                          : "bg-amber-500/12 text-amber-200"
                    }`}
                  >
                    {entry.status === "approved" ? (
                      <ShieldCheck className="h-4.5 w-4.5" />
                    ) : entry.status === "rejected" ? (
                      <XCircle className="h-4.5 w-4.5" />
                    ) : (
                      <Clock3 className="h-4.5 w-4.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{entry.username}</span>
                      {entry.fullName && <span className="text-sm text-slate-500">{entry.fullName}</span>}
                      <DeviceStatusPill status={entry.status} />
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      {entry.deviceLabel || "Unnamed device"} ·{" "}
                      <span className="font-mono text-xs uppercase tracking-wide text-slate-500">
                        {entry.mac}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                      <div>Requested {formatTimestamp(entry.requestedAt)}</div>
                      <div>
                        {entry.decidedAt
                          ? `Decided ${formatTimestamp(entry.decidedAt)}`
                          : "Decision time not recorded"}
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-500">
                      {entry.decidedBy ? `By ${entry.decidedBy}` : "By system / Telegram"}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!loading && visibleHistory.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
                No approval history matches the current filters.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4 text-sm text-slate-500">
        Approval decisions force a live reauthentication attempt when the device is already
        online, so policy changes can apply without waiting for the user to reconnect.
      </div>

      {selectedUser && (
        <UserDevicesModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDecision={decide}
          busyId={busyId}
        />
      )}
    </div>
  );
}

function UserDevicesModal({
  user,
  onClose,
  onDecision,
  busyId,
}: {
  user: {
    id: string;
    username: string;
    fullName: string | null;
    devices: AdminDeviceSummary[];
  };
  onClose: () => void;
  onDecision: (device: AdminDeviceSummary, status: "approved" | "rejected") => Promise<void>;
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
            <div className="mt-1 text-sm text-slate-500">
              {user.username} · device inventory and approval state
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {user.devices.map((device) => (
            <div
              key={device.id}
              className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-300">
                  <UserRound className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">
                      {device.label || "Unnamed device"}
                    </span>
                    <DeviceStatusPill status={device.status} />
                  </div>
                  <div className="mt-2 font-mono text-xs uppercase tracking-wide text-slate-500">
                    {device.mac}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    Last seen {formatTimestamp(device.lastSeenAt)}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{DeviceMethodCopy(device)}</div>
                  <div className="mt-4">
                    <ActionButtons
                      device={device}
                      busy={busyId === device.id}
                      onInspect={() => undefined}
                      onDecision={(status) => void onDecision(device, status)}
                      showInspect={false}
                    />
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
