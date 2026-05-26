import { useEffect, useState } from "react";
import { FileText, ShieldAlert } from "lucide-react";
import type { AuthenticationEvent, AuditLogEntry } from "@app/shared";
import { listAuditLogs, listAuthenticationEvents } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

export function LiveAuditView() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"audit" | "auth">("audit");
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [authEvents, setAuthEvents] = useState<AuthenticationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([listAuditLogs(token), listAuthenticationEvents(token)])
      .then(([audit, auth]) => {
        setAuditLogs(audit.items);
        setAuthEvents(auth.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Audit & Authentication</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Administrative changes and RADIUS/web access outcomes</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex">
          <button onClick={() => setTab("audit")} className={`px-3 py-2 text-xs rounded-md ${tab === "audit" ? "bg-indigo-600 text-white" : "text-zinc-400"}`}>Audit log</button>
          <button onClick={() => setTab("auth")} className={`px-3 py-2 text-xs rounded-md ${tab === "auth" ? "bg-indigo-600 text-white" : "text-zinc-400"}`}>Auth events</button>
        </div>
      </div>
      {error && <div className="text-rose-300 border border-rose-900 rounded-lg px-4 py-3 text-sm">{error}</div>}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {tab === "audit" && auditLogs.map((entry) => (
          <div key={entry.id} className="px-5 py-4 flex gap-4 items-center">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center"><FileText className="w-4 h-4 text-indigo-400" /></div>
            <div className="flex-1">
              <div className="text-sm text-zinc-100">
                <span className="font-medium">{entry.actor || "system"}</span>
                <span className="mx-2 text-zinc-600">/</span>
                <span className="font-mono text-xs text-indigo-400">{entry.action}</span>
                <span className="mx-2 text-zinc-600">/</span>
                <span className="text-zinc-300">{entry.targetType}{entry.targetId ? ` ${entry.targetId}` : ""}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">{entry.ip || "no IP recorded"}</div>
            </div>
            <time className="text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</time>
          </div>
        ))}
        {tab === "auth" && authEvents.map((entry) => (
          <div key={entry.id} className="px-5 py-4 flex gap-4 items-center">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-sky-400" /></div>
            <div className="flex-1">
              <div className="text-sm text-zinc-100 font-medium">{entry.username}</div>
              <div className="text-xs text-zinc-500 mt-1">{entry.source} / {entry.type}</div>
            </div>
            <time className="text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</time>
          </div>
        ))}
        {tab === "audit" && auditLogs.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">No audit activity recorded.</div>}
        {tab === "auth" && authEvents.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">No authentication events recorded.</div>}
      </div>
    </div>
  );
}
