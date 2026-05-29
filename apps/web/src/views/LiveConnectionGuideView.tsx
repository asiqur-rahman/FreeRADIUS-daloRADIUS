// ─────────────────────────────────────────────────────────────────────
//  How to Connect — user portal connection guide.
//  Covers PEAP-MSCHAPv2 (password) and EAP-TLS (certificate) for
//  Windows, macOS, iOS, Android, and Linux.
// ─────────────────────────────────────────────────────────────────────
import { useState } from "react";
import {
  AlertCircle,
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Info,
  Key,
  Laptop,
  Lock,
  Monitor,
  ShieldCheck,
  Smartphone,
  Tablet,
  Terminal,
  Wifi,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { apiDownload } from "../api/client";

// ── Types ─────────────────────────────────────────────────────────────

type Method = "peap" | "eap-tls";
type Os = "windows" | "macos" | "ios" | "android" | "linux";

// ── Helpers ───────────────────────────────────────────────────────────

function StepList({ steps }: { steps: Array<{ title: string; detail?: string; code?: string }> }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white mt-0.5">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-stone-900">{s.title}</div>
            {s.detail && <div className="text-xs text-stone-500 mt-0.5 leading-relaxed">{s.detail}</div>}
            {s.code && (
              <code className="mt-1 block rounded-lg bg-stone-900 px-3 py-2 text-xs font-mono text-stone-200">
                {s.code}
              </code>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function InfoBox({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warn" }) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  };
  const Icon = type === "warn" ? AlertCircle : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed ${styles[type]}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-stone-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-stone-50 transition-colors text-left"
      >
        <span className="font-medium text-stone-900">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
      </button>
      {open && (
        <div className="border-t border-stone-100 bg-white px-5 py-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Guide content data ─────────────────────────────────────────────────

const GUIDES: Record<Os, Record<Method, Array<{ title: string; detail?: string; code?: string }>>> = {
  windows: {
    peap: [
      { title: "Download the CA certificate", detail: "Click the download button below to get the WiFi CA certificate (.pem). You will need it in the next steps." },
      { title: "Install the CA certificate", detail: 'Double-click the downloaded .pem file → click "Open" → "Install Certificate" → "Local Machine" → "Place all certificates in the following store" → "Trusted Root Certification Authorities" → Finish.' },
      { title: "Open Wi-Fi settings", detail: "Settings → Network & Internet → Wi-Fi → Manage known networks → Add network (or click the network name in the task bar)." },
      { title: "Choose your corporate SSID", detail: "Click the network name in the taskbar, or add it manually in Manage known networks." },
      { title: "Set EAP method to PEAP", detail: "In the network properties: Security type = WPA2-Enterprise, EAP method = PEAP, Authentication = EAP-MSCHAPv2." },
      { title: "Enter your credentials", detail: "Username: your network username. Password: your network password. Leave domain blank unless instructed otherwise." },
      { title: "Configure server certificate", detail: 'Under "Advanced settings" or "More settings", add the CA you installed in step 2 as a trusted certificate. In "Certificate server names" enter the server hostname (e.g. radius.yourcompany.com).' },
      { title: "Connect and verify", detail: "Save and attempt to connect. If prompted to trust the server certificate, verify the thumbprint matches the one shown in the portal." },
    ],
    "eap-tls": [
      { title: "Provision your EAP-TLS certificate", detail: 'Go to "WiFi Cert" tab → click "Provision certificate" → save the .p12 file and note the password shown (it will only be shown once).' },
      { title: "Download the CA certificate", detail: "Also download the WiFi CA certificate (.pem) from the same page." },
      { title: "Install the CA certificate", detail: 'Double-click the CA .pem → "Install Certificate" → "Local Machine" → "Trusted Root Certification Authorities".' },
      { title: "Install the client .p12 certificate", detail: "Double-click the .p12 file → enter the password from step 1 → \"Place in Personal\" store → Finish." },
      { title: "Open Wi-Fi settings", detail: "Settings → Network & Internet → Wi-Fi → Manage known networks." },
      { title: "Set EAP method to EAP-TLS", detail: "Security type = WPA2-Enterprise, EAP method = EAP-TLS." },
      { title: "Select your client certificate", detail: 'Under "Authentication", select the personal certificate you imported in step 4.' },
      { title: "Enter trusted server name", detail: 'In "Certificate server names" enter your RADIUS server hostname. Select your CA under "Root Certificate".' },
      { title: "Connect", detail: "Save and connect. Windows will use your client certificate automatically — no password prompt." },
    ],
  },
  macos: {
    peap: [
      { title: "Download and install the CA certificate", detail: 'Download the WiFi CA below. Double-click to open Keychain Access → add to "System" keychain → double-click the cert → expand "Trust" → set "When using this certificate" to "Always Trust".' },
      { title: "Click your corporate Wi-Fi SSID in the menu bar", detail: "Or go to System Settings → Wi-Fi and click the network name." },
      { title: "Choose WPA2-Enterprise / PEAP", detail: "Mode: PEAP. Authentication: MSCHAPv2." },
      { title: "Enter credentials", detail: "Username: your network username. Password: your network password." },
      { title: "Verify the server certificate", detail: "When prompted to trust the server certificate, click Show Certificate and confirm the fingerprint matches the one in the portal. Then click Continue." },
    ],
    "eap-tls": [
      { title: "Provision your certificate", detail: 'Go to "WiFi Cert" → Provision → save the .p12 and note the password.' },
      { title: "Install the CA certificate", detail: "Download and double-click the WiFi CA → add to System keychain → set to Always Trust." },
      { title: "Install the .p12 client certificate", detail: "Double-click the .p12 → enter the password → add to System keychain." },
      { title: "Connect to the corporate SSID", detail: "Click the network in the Wi-Fi menu. Select EAP-TLS, choose your personal certificate from the dropdown." },
      { title: "Trust the server and verify", detail: "Confirm the server cert fingerprint and click Continue. macOS will now authenticate automatically." },
    ],
  },
  ios: {
    peap: [
      { title: "Install the CA certificate via MDM or manually", detail: 'Email the CA .pem to yourself → open it on iPhone → tap "Allow" to install → go to Settings → General → VPN & Device Management → tap the profile → Install.' },
      { title: "Trust the CA in certificate settings", detail: "Settings → General → About → Certificate Trust Settings → enable the CA certificate." },
      { title: "Connect to the corporate Wi-Fi", detail: "Settings → Wi-Fi → tap your network name." },
      { title: "Enter credentials", detail: "Username and Password when prompted. The CA will be used automatically." },
      { title: "Disable Private Wi-Fi Address for this network", detail: "Tap the (ℹ) next to the network name → Private Wi-Fi Address → set to Off. This ensures your MAC address is consistent for device approval." },
    ],
    "eap-tls": [
      { title: "Provision your certificate on a computer first", detail: "Use the WiFi Cert tab on a computer to provision and download the .p12 file, then transfer it to your iPhone (AirDrop, email, or Files)." },
      { title: "Install the .p12 certificate", detail: "Tap the .p12 file → tap Allow → Settings → General → VPN & Device Management → tap the profile → Install → enter the .p12 password." },
      { title: "Install the CA certificate", detail: "Similarly, open the CA .pem and install it as a profile. Then go to Settings → General → About → Certificate Trust Settings and enable it." },
      { title: "Connect to the SSID", detail: "Settings → Wi-Fi → tap your network → for EAP type select TLS → select your personal certificate → tap Join." },
      { title: "Disable Private Wi-Fi Address", detail: "Tap (ℹ) → Private Wi-Fi Address → Off to ensure consistent MAC for device approval." },
    ],
  },
  android: {
    peap: [
      { title: "Install the CA certificate", detail: "Transfer the CA .pem to your device → Settings → Security (or Biometrics & Security) → Install from storage → select the file → name it (e.g. WiFi-CA) → set use to Wi-Fi." },
      { title: "Connect to the corporate SSID", detail: "Settings → Wi-Fi → tap the network name." },
      { title: "Configure the connection", detail: "EAP method: PEAP. Phase 2 authentication: MSCHAPV2. CA certificate: select the one you installed. Identity: your username. Password: your password." },
      { title: "Disable Randomized MAC", detail: "In the advanced options for this network, set MAC address type to \"Phone MAC\" or \"Device MAC\" (not Randomized) for reliable device approval." },
      { title: "Connect", detail: "Tap Connect. If prompted about the server certificate, verify the hostname and tap Continue." },
    ],
    "eap-tls": [
      { title: "Provision the certificate on a computer", detail: "Use the WiFi Cert tab to provision and download the .p12 file, then transfer it to your Android device." },
      { title: "Install the .p12 certificate", detail: "Settings → Security → Install from storage → select the .p12 → enter the password → name it → set use to Wi-Fi." },
      { title: "Install the CA certificate", detail: "Repeat the above process for the CA .pem file." },
      { title: "Connect and configure", detail: "Settings → Wi-Fi → tap the SSID. EAP method: TLS. CA certificate: select your CA. User certificate: select your client cert. Identity: your username (optional, the cert CN is used)." },
      { title: "Disable Randomized MAC", detail: "In network advanced settings, set MAC type to Device MAC." },
    ],
  },
  linux: {
    peap: [
      { title: "Install the CA certificate system-wide", detail: "Copy the CA .pem to /usr/local/share/ca-certificates/ (Debian/Ubuntu) or /etc/pki/ca-trust/source/anchors/ (RHEL/Fedora), then run update-ca-certificates or update-ca-trust." },
      { title: "Connect via NetworkManager (GNOME / KDE)", detail: "Click the network icon → select your SSID → Security: WPA & WPA2 Enterprise → Authentication: Tunneled TLS (TTLS) or Protected EAP (PEAP)." },
      { title: "Fill in the settings", detail: "CA certificate: path to your .pem. Anonymous identity: anonymous. Username / Password: your credentials." },
      { title: "Or use nmcli", code: `nmcli con add type wifi ssid "YourSSID" \\
  wifi-sec.key-mgmt wpa-eap \\
  802-1x.eap peap \\
  802-1x.phase2-auth mschapv2 \\
  802-1x.identity "username" \\
  802-1x.password "password" \\
  802-1x.ca-cert /path/to/wifi-ca.pem` },
    ],
    "eap-tls": [
      { title: "Provision and download the .p12 certificate", detail: "Use the WiFi Cert tab on this portal. Transfer the .p12 to your Linux machine." },
      { title: "Extract PEM files from the .p12", code: `# Extract the certificate
openssl pkcs12 -in client.p12 -nokeys -out client.pem
# Extract the private key (will prompt for .p12 password)
openssl pkcs12 -in client.p12 -nocerts -nodes -out client.key
chmod 600 client.key` },
      { title: "Install the CA certificate", detail: "Copy the CA .pem to /usr/local/share/ca-certificates/ and run update-ca-certificates." },
      { title: "Connect via nmcli", code: `nmcli con add type wifi ssid "YourSSID" \\
  wifi-sec.key-mgmt wpa-eap \\
  802-1x.eap tls \\
  802-1x.identity "username" \\
  802-1x.ca-cert /path/to/wifi-ca.pem \\
  802-1x.client-cert /path/to/client.pem \\
  802-1x.private-key /path/to/client.key` },
      { title: "Or use wpa_supplicant", code: `# /etc/wpa_supplicant/corp.conf
network={
    ssid="YourSSID"
    key_mgmt=WPA-EAP
    eap=TLS
    identity="username"
    ca_cert="/path/to/wifi-ca.pem"
    client_cert="/path/to/client.pem"
    private_key="/path/to/client.key"
}` },
    ],
  },
};

// ── OS icons ─────────────────────────────────────────────────────────

const OS_CONFIG: Array<{ id: Os; label: string; icon: React.ElementType }> = [
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "macos",   label: "macOS",   icon: Laptop },
  { id: "ios",     label: "iPhone / iPad", icon: Tablet },
  { id: "android", label: "Android", icon: Smartphone },
  { id: "linux",   label: "Linux",   icon: Terminal },
];

// ── Main component ─────────────────────────────────────────────────────

export function LiveConnectionGuideView() {
  const [method, setMethod] = useState<Method>("peap");
  const [os, setOs] = useState<Os>("windows");
  const [caNotice, setCaNotice] = useState<string | null>(null);
  const { token } = useAuth();

  const steps = GUIDES[os][method];

  const downloadCa = async () => {
    if (!token) return;
    setCaNotice(null);
    try {
      await apiDownload("/api/v1/me/wifi-ca", "wifi-ca.pem", { token });
    } catch {
      setCaNotice("CA certificate not available — contact your administrator.");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>
          How to Connect
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          Step-by-step guides to connect your device to the corporate Wi-Fi network.
        </p>
      </div>

      {/* Method selector */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Authentication method
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMethod("peap")}
            className={`flex flex-col items-start gap-1.5 rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              method === "peap"
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400"
            }`}
          >
            <Key className={`h-5 w-5 ${method === "peap" ? "text-amber-300" : "text-stone-500"}`} />
            <div className="font-semibold text-sm">Password</div>
            <div className={`text-xs leading-relaxed ${method === "peap" ? "text-stone-400" : "text-stone-500"}`}>
              PEAP-MSCHAPv2 · username + password.
              Works on all devices out of the box.
            </div>
          </button>
          <button
            onClick={() => setMethod("eap-tls")}
            className={`flex flex-col items-start gap-1.5 rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              method === "eap-tls"
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400"
            }`}
          >
            <ShieldCheck className={`h-5 w-5 ${method === "eap-tls" ? "text-emerald-400" : "text-stone-500"}`} />
            <div className="font-semibold text-sm">Certificate (EAP-TLS)</div>
            <div className={`text-xs leading-relaxed ${method === "eap-tls" ? "text-stone-400" : "text-stone-500"}`}>
              Phish-proof · no password needed.
              Requires provisioning a certificate first.
            </div>
          </button>
        </div>
      </div>

      {/* OS selector */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Your operating system
        </div>
        <div className="flex flex-wrap gap-2">
          {OS_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setOs(id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                os === id
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CA download */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Lock className="h-5 w-5 text-amber-300" />
          </div>
          <div className="flex-1">
            <div className="font-semibold mb-0.5">Download the WiFi CA Certificate</div>
            <p className="text-xs text-stone-400 leading-relaxed mb-3">
              Your device must trust the network's Certificate Authority to verify the RADIUS server.
              Install this certificate before connecting.
            </p>
            {caNotice && (
              <div className="mb-2 rounded-lg border border-rose-800/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                {caNotice}
              </div>
            )}
            <button
              onClick={() => void downloadCa()}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-stone-900 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download WiFi CA (.pem)
            </button>
          </div>
        </div>
      </div>

      {/* EAP-TLS certificate reminder */}
      {method === "eap-tls" && (
        <InfoBox type="warn">
          <strong>Before starting:</strong> You need a personal EAP-TLS certificate. Go to the{" "}
          <strong>WiFi Cert</strong> tab → click <strong>Provision certificate</strong> → download the .p12 file
          and save the password (shown only once). Then follow the steps below.
        </InfoBox>
      )}

      {/* Steps */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          {(() => {
            const Icon = OS_CONFIG.find((o) => o.id === os)?.icon ?? Monitor;
            return <Icon className="h-5 w-5 text-stone-600" />;
          })()}
          <div>
            <div className="font-semibold text-stone-900">
              {OS_CONFIG.find((o) => o.id === os)?.label} ·{" "}
              {method === "peap" ? "PEAP-MSCHAPv2 (Password)" : "EAP-TLS (Certificate)"}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">{steps.length} steps</div>
          </div>
        </div>
        <StepList steps={steps} />
      </div>

      {/* Credentials display */}
      {method === "peap" && (
        <Accordion title="Your credentials">
          <p className="text-xs text-stone-500">
            Use the credentials below when connecting. Contact IT if your account is locked or you need a password reset.
          </p>
          <CredentialDisplay />
        </Accordion>
      )}

      {/* MAC randomization warning */}
      <Accordion title="MAC address randomization issues">
        <InfoBox type="info">
          Modern phones (iOS 14+, Android 10+, Windows 11) use a random MAC address per Wi-Fi network by default.
          If your device requires approval, the randomized MAC will appear as a new unknown device each connection.
          Disable Private/Randomized MAC for the corporate SSID in your device's Wi-Fi settings to ensure consistent identity.
        </InfoBox>
        <div className="space-y-2 text-xs text-stone-600">
          <p><strong className="text-stone-800">iOS:</strong> Settings → Wi-Fi → tap (ℹ) next to network → Private Wi-Fi Address → Off</p>
          <p><strong className="text-stone-800">Android:</strong> Settings → Wi-Fi → long-press network → Modify → Advanced → MAC address type → Device MAC</p>
          <p><strong className="text-stone-800">Windows 11:</strong> Settings → Network → Wi-Fi → Manage known networks → network properties → Random hardware addresses → Off</p>
        </div>
      </Accordion>

      {/* Trusted cert thumbprints (Windows) */}
      {os === "windows" && (
        <Accordion title="Windows: Trusted certificate thumbprints">
          <InfoBox type="info">
            Windows 11 WPA2-Enterprise networks may show "Can't connect to this network" unless you add the RADIUS server certificate's SHA-1 thumbprint
            to the trusted list. Go to the admin portal (if you have access) → Settings → EAP Server Certificates, or ask your IT administrator
            for the thumbprint to enter in step 7.
          </InfoBox>
          <p className="text-xs text-stone-500 leading-relaxed">
            Location: Network adapter properties → Security tab → Settings → Trusted Root CA list → also add
            the thumbprint in the "Certificate server names" field. The format is uppercase hex with no separators, e.g.:
            <code className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 font-mono">AB1234567890CDEF…</code>
          </p>
        </Accordion>
      )}

      {/* Need help */}
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 flex items-start gap-4">
        <Award className="h-6 w-6 text-stone-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-stone-900 mb-1">Still having trouble?</div>
          <p className="text-xs text-stone-500 leading-relaxed">
            Check your device's MAC address is registered and approved in the <strong className="text-stone-700">Devices</strong> tab.
            If your device is showing as "pending", wait for administrator approval or contact IT.
            For certificate issues, try re-provisioning a new certificate from the <strong className="text-stone-700">WiFi Cert</strong> tab.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Credential display sub-component ──────────────────────────────────

function CredentialDisplay() {
  const { user } = useAuth();
  const [copied, setCopied] = useState<"user" | null>(null);

  const username = user?.username ?? "—";

  const copy = async (text: string, field: "user") => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-0.5">Username</div>
          <div className="font-mono text-sm text-stone-900">{username}</div>
        </div>
        <button
          onClick={() => void copy(username, "user")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 transition-colors"
        >
          {copied === "user" ? <><Check className="h-3 w-3 text-emerald-500" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <Wifi className="h-4 w-4 text-stone-400 shrink-0" />
        <div className="text-xs text-stone-500">
          Your password is the same one you use to sign in to this portal.
          If you need to reset it, go to the <strong className="text-stone-700">Security</strong> tab.
        </div>
      </div>
    </div>
  );
}
