import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import type { EapCertificate } from "@app/shared";
import { listCerts } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

export function LiveSettingsView() {
  const { token } = useAuth();
  const [certs, setCerts] = useState<EapCertificate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listCerts(token).then(setCerts).catch((err: Error) => setError(err.message));
  }, [token]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div><h2 className="text-xl font-semibold text-white">Settings</h2><p className="text-sm text-zinc-500 mt-0.5">Certificate inventory and operational security posture</p></div>
      {error && <div className="text-rose-300 border border-rose-900 rounded-lg p-3 text-sm">{error}</div>}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4"><KeyRound className="w-5 h-5 text-amber-400" /><h3 className="font-semibold text-white">EAP Server Certificates</h3></div>
        {certs.map((cert) => (
          <div key={cert.id} className="flex items-center gap-3 py-3 border-t border-zinc-800">
            {cert.severity === "ok" ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
            <div className="flex-1"><div className="text-sm text-zinc-100">{cert.subject}</div><div className="text-xs text-zinc-500 font-mono">{cert.fingerprint.slice(0, 20)}...</div></div>
            <div className="text-xs text-zinc-400">{cert.isActive ? "Active / " : ""}{cert.daysUntilExpiry} days remaining</div>
          </div>
        ))}
        {certs.length === 0 && <p className="text-sm text-zinc-500">No EAP certificates inventoried yet.</p>}
      </div>
    </div>
  );
}
