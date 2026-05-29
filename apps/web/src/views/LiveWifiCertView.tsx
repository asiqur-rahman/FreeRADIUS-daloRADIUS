import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Key,
  Loader2,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import type { ProvisionUserCertResponse, UserClientCert } from "@app/shared";
import { listMyCerts, provisionMyCert, revokeMyCert } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";

function CertStatusBadge({ cert }: { cert: UserClientCert }) {
  const now = new Date();
  const expired = new Date(cert.expiresAt) < now;
  if (cert.revokedAt) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Revoked</span>;
  if (expired) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Expired</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Active</span>;
}

function useCopyText() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);
  return { copied, copy };
}

function BundleDownloadPanel({
  bundle,
  onDismiss,
}: {
  bundle: ProvisionUserCertResponse;
  onDismiss: () => void;
}) {
  const { copied, copy } = useCopyText();

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPkcs12 = () => {
    const bin = atob(bundle.pkcs12Base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/x-pkcs12" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wifi-certificate.p12";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center flex-shrink-0">
            <Key className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900">Certificate ready — save it now</h3>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed max-w-lg">
              The private key will <strong>never be shown again</strong>. Download the .p12 file and note the password before closing this banner.
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-900 mt-0.5 flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={downloadPkcs12}
          className="flex items-center justify-center gap-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
        >
          <Download className="w-4 h-4" />
          Download wifi-certificate.p12
        </button>
        <button
          onClick={() => downloadFile(bundle.certificatePem, "wifi-cert.pem", "application/x-pem-file")}
          className="flex items-center justify-center gap-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 text-sm font-medium px-4 py-3 rounded-xl transition-colors"
        >
          <Download className="w-4 h-4" />
          Download cert.pem (optional)
        </button>
      </div>

      <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-2">
        <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">P12 Password</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm text-stone-900 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 select-all break-all">
            {bundle.pkcs12Password}
          </code>
          <button
            onClick={() => copy(bundle.pkcs12Password, "pwd")}
            className="p-2 hover:bg-amber-100 rounded-lg text-amber-700 transition-colors flex-shrink-0"
            title="Copy password"
          >
            {copied === "pwd" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-amber-700">You'll need this password when importing the .p12 on your device.</p>
      </div>

      <div className="text-xs text-stone-900 font-semibold">
        Common name: <code className="font-mono text-stone-600">{bundle.commonName}</code>
        &nbsp;·&nbsp; Expires: {new Date(bundle.expiresAt).toLocaleDateString()}
      </div>
    </div>
  );
}

type Platform = "ios" | "windows" | "android" | "macos";

const PLATFORM_GUIDES: Record<Platform, { label: string; steps: string[] }> = {
  ios: {
    label: "iOS",
    steps: [
      "AirDrop or email yourself the wifi-certificate.p12 file.",
      "Open the file — iOS will prompt to install a profile. Tap Allow.",
      "Go to Settings → General → VPN & Device Management → tap the new profile → Install.",
      "Enter the P12 password when prompted.",
      "Go to Settings → Wi-Fi → tap your corporate network → configure for EAP-TLS.",
      "Select your imported certificate when asked for client identity.",
    ],
  },
  macos: {
    label: "macOS",
    steps: [
      "Double-click the wifi-certificate.p12 file to open Keychain Access.",
      "Enter the P12 password — the cert and key are imported to your login keychain.",
      "Open System Settings → Wi-Fi → select your corporate network → Edit.",
      "Under Authentication, choose TLS, then pick your certificate.",
      "Trust the CA certificate when prompted.",
    ],
  },
  windows: {
    label: "Windows",
    steps: [
      "Double-click wifi-certificate.p12 → Import Wizard → Local Machine → Next.",
      "Confirm the file path, enter the P12 password, check Mark key as exportable.",
      "Place certificate in Personal store → Finish.",
      "Open Network & Internet → Wi-Fi → Manage known networks → select your corporate network.",
      "Authentication: set EAP method to Microsoft: Smart Card or other certificate.",
      "Click Settings → Use a certificate on this computer → select your cert.",
    ],
  },
  android: {
    label: "Android",
    steps: [
      "Transfer the wifi-certificate.p12 to your device (Files app, USB, or email).",
      "Go to Settings → Security → Encryption & credentials → Install a certificate → Wi-Fi certificate.",
      "Select the .p12 file, enter the password, and give it a name.",
      "Go to Settings → Network → Wi-Fi → tap your corporate network.",
      "Set EAP method to TLS, pick your certificate for client identity.",
      "Leave CA certificate as System or import the CA PEM if required.",
    ],
  },
};

function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [open, setOpen] = useState(false);
  const guide = PLATFORM_GUIDES[platform];

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="font-semibold text-stone-900 text-sm">How to install on your device</div>
            <div className="text-xs text-stone-500">Step-by-step guide for iOS, macOS, Windows, Android</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-stone-100">
          <div className="flex gap-2 pt-4 flex-wrap">
            {(Object.keys(PLATFORM_GUIDES) as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  platform === p
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {PLATFORM_GUIDES[p].label}
              </button>
            ))}
          </div>
          <ol className="space-y-2.5">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-stone-700 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function LiveWifiCertView() {
  const { token } = useAuth();
  const [certs, setCerts] = useState<UserClientCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProvisionUserCertResponse | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCerts = useCallback(async () => {
    if (!token) return;
    try {
      setCerts(await listMyCerts(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load certificates");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadCerts(); }, [loadCerts]);

  const activeCerts = certs.filter((c) => !c.revokedAt && new Date(c.expiresAt) >= new Date());

  const handleProvision = async () => {
    if (!token) return;
    setProvisioning(true);
    setNotice(null);
    try {
      const result = await provisionMyCert(token, {});
      setBundle(result);
      await loadCerts();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Failed to generate certificate" });
    } finally {
      setProvisioning(false);
    }
  };

  const handleRevoke = async (certId: string) => {
    if (!token) return;
    setRevoking(certId);
    try {
      await revokeMyCert(token, certId);
      await loadCerts();
      setNotice({ ok: true, text: "Certificate revoked. Existing sessions using this cert will be blocked at next re-auth." });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Failed to revoke certificate" });
    } finally {
      setRevoking(null);
    }
  };

  const downloadCa = async () => {
    if (!token) return;
    try {
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/me/wifi-ca`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        setNotice({ ok: false, text: "CA certificate not available on this server." });
        return;
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "application/x-pem-file" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wifi-ca.pem";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ ok: false, text: "Failed to download CA certificate." });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>
          WiFi Certificate
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          Certificate-based (EAP-TLS) access — connect without a password. Your identity is proven by a private key that never leaves your device.
        </p>
      </div>

      {notice && (
        <div
          className={`border rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
            notice.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* One-time bundle */}
      {bundle && <BundleDownloadPanel bundle={bundle} onDismiss={() => setBundle(null)} />}

      {/* How it works + generate */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-stone-900">How certificate authentication works</h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-lg">
              You receive a personal certificate (.p12 file). Install it on any of your devices. When connecting to the corporate WiFi, your device presents this certificate instead of a username and password. The network verifies it was signed by the company CA.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            { icon: Key, text: "Private key stays on your device only" },
            { icon: ShieldCheck, text: "Signed by the company CA — tamper-proof" },
            { icon: Wifi, text: "Connect from any approved device, no password" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-stone-50 rounded-xl p-3">
              <Icon className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-stone-700 leading-relaxed">{text}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={handleProvision}
            disabled={provisioning}
            className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {provisioning ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
            ) : (
              <><Key className="w-4 h-4" />Generate My WiFi Certificate</>
            )}
          </button>
          <button
            onClick={downloadCa}
            className="flex items-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />Download CA Certificate
          </button>
        </div>
        <p className="text-[11px] text-stone-400">
          You can generate multiple certificates — useful for different devices or to replace a lost one. Revoke any you no longer need.
        </p>
      </div>

      {/* Certificate list */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900">Your certificates</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {loading ? "Loading…" : `${activeCerts.length} active${certs.length > activeCerts.length ? `, ${certs.length - activeCerts.length} revoked/expired` : ""}`}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-stone-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading certificates…
          </div>
        )}

        {!loading && error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {!loading && !error && certs.length === 0 && (
          <div className="text-center py-8 text-stone-400 text-sm">
            No certificates yet. Generate one above to get started.
          </div>
        )}

        {!loading && !error && certs.length > 0 && (
          <div className="space-y-2">
            {certs.map((cert) => {
              const isActive = !cert.revokedAt && new Date(cert.expiresAt) >= new Date();
              return (
                <div
                  key={cert.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    isActive
                      ? "bg-stone-50 border-stone-200"
                      : "bg-stone-50/40 border-stone-100 opacity-60"
                  }`}
                >
                  <Key className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-600" : "text-stone-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900 font-mono truncate">{cert.commonName}</div>
                    <div className="text-xs text-stone-500 mt-0.5 truncate font-mono">{cert.fingerprint}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      Expires {new Date(cert.expiresAt).toLocaleDateString()}
                      {cert.revokedAt && ` · Revoked ${new Date(cert.revokedAt).toLocaleDateString()}`}
                      {cert.notes && ` · ${cert.notes}`}
                    </div>
                  </div>
                  <CertStatusBadge cert={cert} />
                  {isActive && (
                    <button
                      onClick={() => handleRevoke(cert.id)}
                      disabled={revoking === cert.id}
                      className="p-2 hover:bg-rose-50 rounded-lg text-stone-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                      title="Revoke certificate"
                    >
                      {revoking === cert.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Install guide */}
      <InstallGuide />

      {/* CA cert info */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-stone-600 leading-relaxed">
          <strong className="text-stone-900">CA certificate trust:</strong> Your device must trust the company CA to verify the network's server certificate during EAP-TLS. Download the CA PEM above and import it to your device's trusted certificate store if prompted. On managed devices this is usually pushed automatically by IT.
        </div>
      </div>
    </div>
  );
}
