import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react";
import type { AdminDeviceSummary, DeviceApprovalEntry } from "@app/shared";
import {
  decideAdminDevice,
  listAdminDevices,
  listDeviceApprovals,
  listUserDevicesForAdmin,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type DeviceTab = "pending" | "devices" | "history";
type DeviceFilter = "all" | "pending" | "approved" | "rejected";

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function DeviceStatusPill({ status }: { status: AdminDeviceSummary["status"] }) {
  const styles = {
    pending: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    approved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "approved" ? "bg-emerald-400" : status === "rejected" ? "bg-rose-400" : "bg-amber-400"}`} />
      {status}
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
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
        text: err instanceof ApiCallError ? err.payload.message : "Unable to load approval workspace",
      });
    } finally {
      setLoading(false);
    }
  }, [filter, query, tab, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    return overview.reduce(
      (acc, device) => {
        acc.total += 1;
        acc[device.status] += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0 },
    );
  }, [overview]);

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
        text: err instanceof ApiCallError ? err.payload.message : "Unable to load the user's devices",
      });
    }
  };

  const decide = async (device: AdminDeviceSummary, status: "approved" | "rejected") => {
    if (!token) return;
    setBusyId(device.id);
    setNotice(null);
    try {
      const result = await decideAdminDevice(token, device.id, { status });
      const message =
        result.disconnectedSessions > 0
          ? `${device.mac} marked ${status}. Forced reauthentication for ${result.disconnectedSessions} active session(s).`
          : `${device.mac} marked ${status}. No active session needed reauthentication.`;
      setNotice({ ok: true, text: message });
      await load();
      if (selectedUser?.id === device.userId) {
        const updated = await listUserDevicesForAdmin(token, device.userId, { pageSize: 100 });
        setSelectedUser({
          id: device.userId,
          username: device.username,
          fullName: device.fullName,
          devices: updated.items,
        });
      }
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : `Unable to ${status} device`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const visibleHistory =
    tab === "history" && query
      ? history.filter((entry) => {
          const q = query.toLowerCase();
          return (
            entry.username.toLowerCase().includes(q) ||
            entry.mac.toLowerCase().includes(q) ||
            (entry.deviceLabel || "").toLowerCase().includes(q) ||
            (entry.notes || "").toLowerCase().includes(q)
          );
        })
      : history;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Device approvals</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Review first-seen devices, approve or reject them, and track every decision.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Pending" value={counts.pending} hint="Needs an operator decision" />
        <StatTile label="Approved" value={counts.approved} hint="Allowed onto the normal policy path" />
        <StatTile label="Rejected" value={counts.rejected} hint="Blocked at the approval layer" />
        <StatTile label="Known Devices" value={counts.total} hint="All device identities on record" />
      </div>

      {notice && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-emerald-900 bg-emerald-950/20 text-emerald-300" : "border-rose-900 bg-rose-950/20 text-rose-300"}`}>
          {notice.text}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-1">
            {[
              { id: "pending", label: "Pending queue" },
              { id: "devices", label: "All devices" },
              { id: "history", label: "Decision history" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as DeviceTab)}
                className={`rounded-md px-3 py-2 text-xs font-medium ${tab === item.id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "history" ? "Search approvals..." : "Search user, MAC, or label..."}
                className="w-72 rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as DeviceFilter)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-600 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {(tab === "pending" || tab === "devices") && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User / device</th>
                  <th className="px-4 py-3 font-medium">MAC</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Request timeline</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                          <Smartphone className="h-4 w-4" />
                        </div>
                        <div>
                          <button
                            onClick={() => inspectUser(device)}
                            className="text-left font-medium text-zinc-100 hover:text-indigo-300"
                          >
                            {device.label || "Unnamed device"}
                          </button>
                          <div className="mt-1 text-xs text-zinc-500">
                            {device.username}
                            {device.fullName ? ` - ${device.fullName}` : ""}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Learned {formatTimestamp(device.learnedAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{device.mac}</td>
                    <td className="px-4 py-3">
                      <DeviceStatusPill status={device.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      <div>Requested {formatTimestamp(device.requestedAt)}</div>
                      <div className="mt-1">Last seen {formatTimestamp(device.lastSeenAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {device.decisionNotes || "No operator note yet"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => inspectUser(device)}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          Inspect
                        </button>
                        {device.status !== "approved" && (
                          <button
                            onClick={() => void decide(device, "approved")}
                            disabled={busyId === device.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            {busyId === device.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Approve
                          </button>
                        )}
                        {device.status !== "rejected" && (
                          <button
                            onClick={() => void decide(device, "rejected")}
                            disabled={busyId === device.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-60"
                          >
                            {busyId === device.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && devices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                      No devices match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "history" && (
          <div className="divide-y divide-zinc-800/60">
            {visibleHistory.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-4">
                <div className={`rounded-lg p-2 ${entry.status === "approved" ? "bg-emerald-500/10 text-emerald-300" : entry.status === "rejected" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                  {entry.status === "approved" ? <ShieldCheck className="h-4 w-4" /> : entry.status === "rejected" ? <XCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-100">{entry.username}</span>
                    {entry.fullName && <span className="text-zinc-500">{entry.fullName}</span>}
                    <DeviceStatusPill status={entry.status} />
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {entry.deviceLabel || "Unnamed device"} - <span className="font-mono">{entry.mac}</span>
                  </div>
                  <div className="mt-2 text-xs text-zinc-400">
                    Requested {formatTimestamp(entry.requestedAt)}{entry.decidedAt ? ` - Decided ${formatTimestamp(entry.decidedAt)}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {entry.decidedBy ? `By ${entry.decidedBy}` : "By system / Telegram"}{entry.notes ? ` - ${entry.notes}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {!loading && visibleHistory.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">No approval history matches the current filters.</div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-xs text-zinc-500">
        Approval decisions force a live reauthentication attempt when the device is already online, so VLAN or access policy changes can take effect without waiting for the user to notice.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{user.fullName || user.username}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{user.username} - device inventory and approval state</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {user.devices.map((device) => (
            <div key={device.id} className="flex items-center gap-4 px-5 py-4">
              <div className="rounded-lg bg-zinc-800 p-2 text-zinc-300">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{device.label || "Unnamed device"}</span>
                  <DeviceStatusPill status={device.status} />
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  <span className="font-mono">{device.mac}</span>
                  <span className="mx-2 text-zinc-700">-</span>
                  Last seen {formatTimestamp(device.lastSeenAt)}
                </div>
              </div>
              <div className="flex gap-2">
                {device.status !== "approved" && (
                  <button
                    onClick={() => void onDecision(device, "approved")}
                    disabled={busyId === device.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Approve
                  </button>
                )}
                {device.status !== "rejected" && (
                  <button
                    onClick={() => void onDecision(device, "rejected")}
                    disabled={busyId === device.id}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-60"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
          {user.devices.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">No devices recorded for this user yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
