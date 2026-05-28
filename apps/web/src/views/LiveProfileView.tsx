import { useState } from "react";
import { HelpCircle, Wifi, Download, Monitor, Smartphone } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildWindowsXml(ssid: string): string {
  const safe = escapeXml(ssid);
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${safe}</name>
  <SSIDConfig>
    <SSID><name>${safe}</name></SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2</authentication>
        <encryption>AES</encryption>
        <useOneX>true</useOneX>
      </authEncryption>
      <OneX xmlns="http://www.microsoft.com/networking/OneX/v1">
        <authMode>user</authMode>
        <EAPConfig>
          <EapHostConfig xmlns="http://www.microsoft.com/provisioning/EapHostConfig">
            <EapMethod>
              <Type xmlns="http://www.microsoft.com/provisioning/EapCommon">25</Type>
              <VendorId xmlns="http://www.microsoft.com/provisioning/EapCommon">0</VendorId>
              <VendorType xmlns="http://www.microsoft.com/provisioning/EapCommon">0</VendorType>
              <AuthorId xmlns="http://www.microsoft.com/provisioning/EapCommon">0</AuthorId>
            </EapMethod>
            <Config xmlns="http://www.microsoft.com/provisioning/EapHostConfig">
              <Eap xmlns="http://www.microsoft.com/provisioning/BaseEapConnectionPropertiesV1">
                <Type>25</Type>
                <EapType xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV1">
                  <ServerValidation>
                    <DisableUserPromptForServerValidation>true</DisableUserPromptForServerValidation>
                    <ServerNames></ServerNames>
                    <TrustedRootCA></TrustedRootCA>
                  </ServerValidation>
                  <FastReconnect>true</FastReconnect>
                  <InnerEapOptional>false</InnerEapOptional>
                  <Eap xmlns="http://www.microsoft.com/provisioning/BaseEapConnectionPropertiesV1">
                    <Type>26</Type>
                    <EapType xmlns="http://www.microsoft.com/provisioning/MsChapV2ConnectionPropertiesV1">
                      <UseWinLogonCredentials>false</UseWinLogonCredentials>
                    </EapType>
                  </Eap>
                  <EnableQuarantineChecks>false</EnableQuarantineChecks>
                  <RequireCryptoBinding>false</RequireCryptoBinding>
                  <PeapExtensions>
                    <PerformServerValidation xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">false</PerformServerValidation>
                    <AcceptServerName xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">false</AcceptServerName>
                  </PeapExtensions>
                </EapType>
              </Eap>
            </Config>
          </EapHostConfig>
        </EAPConfig>
      </OneX>
    </security>
  </MSM>
</WLANProfile>`;
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LiveProfileView() {
  const { user, token } = useAuth();
  const [ssid, setSsid] = useState("");
  const [caStatus, setCaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [caError, setCaError] = useState("");

  if (!user) return null;
  const name = user.fullName || user.username;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function downloadCa() {
    setCaStatus("loading");
    setCaError("");
    try {
      const res = await fetch(`${BASE}/api/v1/me/wifi-ca`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Download failed");
      }
      const pem = await res.text();
      triggerDownload(pem, "wifi-ca.pem", "application/x-pem-file");
      setCaStatus("idle");
    } catch (err) {
      setCaError(err instanceof Error ? err.message : "Download failed");
      setCaStatus("error");
    }
  }

  function downloadWindowsProfile() {
    const name = ssid.trim();
    if (!name) return;
    triggerDownload(buildWindowsXml(name), `${name}-wifi.xml`, "application/xml");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h2 className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Profile</h2><p className="text-sm text-stone-500 mt-1">Your account information.</p></div>
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-4 pb-5 border-b border-stone-100"><div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-2xl font-semibold text-white">{initials}</div><div><div className="text-lg font-semibold text-stone-900">{name}</div><div className="text-sm text-stone-500">{user.email}</div></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 text-sm"><div><div className="text-xs uppercase text-stone-500">Username</div><div className="font-mono mt-1">{user.username}</div></div><div><div className="text-xs uppercase text-stone-500">Status</div><div className="mt-1 capitalize">{user.status}</div></div><div><div className="text-xs uppercase text-stone-500">Groups</div><div className="mt-1">{user.groups.map((group) => group.name).join(", ") || "None"}</div></div><div><div className="text-xs uppercase text-stone-500">MFA</div><div className="mt-1">{user.mfaEnabled ? "Enabled" : "Disabled"}</div></div></div>
      </div>

      {/* WiFi Setup */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-stone-100">
          <Wifi className="w-5 h-5 text-stone-400" />
          <div>
            <div className="font-semibold text-stone-900 text-sm">WiFi Setup</div>
            <div className="text-xs text-stone-500 mt-0.5">Downloads to connect this device to the corporate network.</div>
          </div>
        </div>

        {/* CA Certificate */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <div className="text-sm font-medium text-stone-800">CA Certificate</div>
            <div className="text-xs text-stone-500 mt-0.5 max-w-xs">
              Install on Windows, macOS, or iOS to trust the WiFi server certificate.
              Required once per device — skip on Android (it prompts automatically).
            </div>
            {caStatus === "error" && (
              <div className="text-xs text-red-600 mt-1">{caError}</div>
            )}
          </div>
          <button
            onClick={downloadCa}
            disabled={caStatus === "loading"}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            {caStatus === "loading" ? "Downloading…" : "wifi-ca.pem"}
          </button>
        </div>

        {/* Windows Profile */}
        <div className="flex items-start gap-4 pt-4 border-t border-stone-100">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
              <Monitor className="w-4 h-4 text-stone-400" />
              Windows 11 Profile
            </div>
            <div className="text-xs text-stone-500 mt-0.5 mb-2">
              Pre-configured WPA2-Enterprise XML profile. Double-click after download,
              or run: <span className="font-mono">netsh wlan add profile filename=&lt;file&gt;</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="WiFi network name (SSID)"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && downloadWindowsProfile()}
                className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={downloadWindowsProfile}
                disabled={!ssid.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Android hint */}
        <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
          <Smartphone className="w-4 h-4 text-stone-400 shrink-0" />
          <p className="text-xs text-stone-500">
            <span className="font-medium text-stone-600">Android / iOS:</span> Select the network, choose EAP = PEAP, Phase 2 = MSCHAPv2, enter your username and password. No certificate needed.
          </p>
        </div>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-center gap-4"><HelpCircle className="w-5 h-5 text-stone-400" /><div className="text-sm text-stone-700">Contact an administrator to update your name or email address.</div></div>
    </div>
  );
}
