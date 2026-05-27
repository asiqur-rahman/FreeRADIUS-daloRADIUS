import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react";
import type {
  AdminDeviceSummary,
  DeviceApprovalEntry,
  DeviceCertificateBundleResponse,
} from "@app/shared";
import {
  clearAdminDeviceCertificate,
  decideAdminDevice,
  generateAdminDeviceCertificate,
  importAdminDeviceCertificate,
  listAdminDevices,
  listDeviceApprovals,
  listUserDevicesForAdmin,
} from "../api/endpoints";
import { ApiCallError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useSSE } from "../hooks/useSSE";

type DeviceTab = "pending" | "devices" | "history";
type DeviceFilter = "all" | "pending" | "approved" | "rejected";
type CertificateMode = "import" | "generate";

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
  const [certificateModal, setCertificateModal] = useState<{
    device: AdminDeviceSummary;
    mode: CertificateMode;
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

  // Real-time refresh via SSE — auto-reload when a device connects or is decided
  useSSE(token, {
    "device.pending": () => { void load(); },
    "device.decided": () => { void load(); },
  });

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
      const message =
        result.disconnectedSessions > 0
          ? `${device.mac} marked ${status}. Forced reauthentication for ${result.disconnectedSessions} active session(s).`
          : `${device.mac} marked ${status}. No active session needed reauthentication.`;
      setNotice({ ok: true, text: message });
      await load();
      await refreshSelectedUser(device);
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : `Unable to ${status} device`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const clearCertificate = async (device: AdminDeviceSummary) => {
    if (!token) return;
    setBusyId(device.id);
    setNotice(null);
    try {
      const result = await clearAdminDeviceCertificate(token, device.id);
      setNotice({
        ok: true,
        text:
          result.disconnectedSessions > 0
            ? `Removed the client certificate from ${device.mac} and forced ${result.disconnectedSessions} session(s) to reauthenticate.`
            : `Removed the client certificate from ${device.mac}.`,
      });
      await load();
      await refreshSelectedUser(device);
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiCallError ? err.payload.message : "Unable to remove the client certificate",
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                          <div className="mt-1 text-xs text-zinc-500">
                            {device.certFingerprint ? `Client cert bound · ${device.certFingerprint.slice(0, 12)}...` : "Password / MAC path only"}
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
                        <button
                          onClick={() => setCertificateModal({ device, mode: "import" })}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          Cert
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
          onManageCertificate={(device, mode) => setCertificateModal({ device, mode })}
          onClearCertificate={clearCertificate}
          busyId={busyId}
        />
      )}

      {certificateModal && token && (
        <DeviceCertificateModal
          token={token}
          device={certificateModal.device}
          mode={certificateModal.mode}
          onClose={() => setCertificateModal(null)}
          onSaved={async (result, actionLabel) => {
            setNotice({
              ok: true,
              text:
                result.disconnectedSessions > 0
                  ? `${actionLabel} for ${certificateModal.device.mac}. Forced ${result.disconnectedSessions} active session(s) to reauthenticate.`
                  : `${actionLabel} for ${certificateModal.device.mac}.`,
            });
            await load();
            await refreshSelectedUser(certificateModal.device);
          }}
        />
      )}
    </div>
  );
}

function UserDevicesModal({
  user,
  onClose,
  onDecision,
  onManageCertificate,
  onClearCertificate,
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
  onManageCertificate: (device: AdminDeviceSummary, mode: CertificateMode) => void;
  onClearCertificate: (device: AdminDeviceSummary) => Promise<void>;
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
                <div className="mt-1 text-xs text-zinc-500">
                  {device.certFingerprint ? `Client cert bound · ${device.certFingerprint.slice(0, 16)}...` : "No client certificate bound"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onManageCertificate(device, "import")}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Import cert
                </button>
                <button
                  onClick={() => onManageCertificate(device, "generate")}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Issue cert
                </button>
                {device.certFingerprint && (
                  <button
                    onClick={() => void onClearCertificate(device)}
                    disabled={busyId === device.id}
                    className="rounded-lg border border-rose-900 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/30 disabled:opacity-60"
                  >
                    Clear cert
                  </button>
                )}
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

function BundleField({
  label,
  value,
  rows = 5,
}: {
  label: string;
  value: string;
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
        <button
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        rows={rows}
        value={value}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 focus:outline-none"
      />
    </div>
  );
}

function DeviceCertificateModal({
  token,
  device,
  mode,
  onClose,
  onSaved,
}: {
  token: string;
  device: AdminDeviceSummary;
  mode: CertificateMode;
  onClose: () => void;
  onSaved: (
    result: DeviceCertificateBundleResponse | {
      disconnectedSessions: number;
    },
    actionLabel: string,
  ) => Promise<void>;
}) {
  const [pem, setPem] = useState("");
  const [commonName, setCommonName] = useState(device.label || `${device.username}-${device.mac.replace(/:/g, "")}`);
  const [sanEmail, setSanEmail] = useState(device.email);
  const [pkcs12Password, setPkcs12Password] = useState("");
  const [approve, setApprove] = useState(mode === "generate");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<DeviceCertificateBundleResponse | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "import") {
        const result = await importAdminDeviceCertificate(token, device.id, {
          pem,
          approve,
        });
        await onSaved(result, approve ? "Bound and approved the client certificate" : "Bound the client certificate");
        onClose();
        return;
      }

      const result = await generateAdminDeviceCertificate(token, device.id, {
        commonName,
        sanEmail: sanEmail || null,
        pkcs12Password: pkcs12Password || null,
        approve,
      });
      setBundle(result);
      await onSaved(
        result,
        approve ? "Issued and approved the managed client certificate" : "Issued the managed client certificate",
      );
    } catch (err) {
      setError(err instanceof ApiCallError ? err.payload.message : "Unable to process the client certificate");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              {mode === "import" ? "Bind client certificate" : "Issue managed client certificate"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {device.label || "Unnamed device"} · <span className="font-mono">{device.mac}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-rose-900 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {mode === "import" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Client certificate PEM
                </label>
                <textarea
                  value={pem}
                  onChange={(event) => setPem(event.target.value)}
                  rows={10}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Common name
                </label>
                <input
                  value={commonName}
                  onChange={(event) => setCommonName(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  SAN email
                </label>
                <input
                  value={sanEmail}
                  onChange={(event) => setSanEmail(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  PKCS#12 password
                </label>
                <input
                  value={pkcs12Password}
                  onChange={(event) => setPkcs12Password(event.target.value)}
                  placeholder="Leave blank to auto-generate"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={approve}
              onChange={(event) => setApprove(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500"
            />
            <span>Approve this device while applying the certificate</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Close
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting || (mode === "import" && !pem.trim()) || (mode === "generate" && !commonName.trim())}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {mode === "import" ? "Bind certificate" : "Issue certificate"}
            </button>
          </div>

          {bundle && (
            <div className="space-y-4 rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-4">
              <div>
                <h4 className="text-sm font-semibold text-emerald-300">Managed certificate bundle</h4>
                <p className="mt-1 text-xs text-zinc-400">
                  The PKCS#12 password is shown once here. Store it with the bundle before closing this dialog.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100">
                PKCS#12 password: <span className="font-mono">{bundle.pkcs12Password}</span>
              </div>
              <BundleField label="Certificate PEM" value={bundle.certificatePem} rows={8} />
              <BundleField label="Private key PEM" value={bundle.privateKeyPem} rows={8} />
              <BundleField label="PKCS#12 Base64" value={bundle.pkcs12Base64} rows={6} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
