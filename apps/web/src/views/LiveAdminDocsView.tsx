// ─────────────────────────────────────────────────────────────────────
//  Admin Documentation — architecture, authentication methods,
//  FreeRADIUS config snippets, and troubleshooting.
// ─────────────────────────────────────────────────────────────────────
import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Check,
  Database,
  FileText,
  Layers,
  Lock,
  Network,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Wifi,
  AlertTriangle,
  Info,
} from "lucide-react";

// ── Utilities ─────────────────────────────────────────────────────────

function CodeBlock({ code, language = "conf" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{language}</span>
        <button
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {copied ? <><Check className="h-3 w-3 text-emerald-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs text-zinc-200 leading-relaxed font-mono whitespace-pre">{code}</pre>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  color = "text-indigo-400",
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-800/20 transition-colors"
      >
        <Icon className={`h-5 w-5 ${color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">{title}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-5 py-5 space-y-4 text-sm text-zinc-300 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function Note({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warn" | "critical" }) {
  const styles = {
    info:     "border-sky-800/60 bg-sky-950/30 text-sky-300",
    warn:     "border-amber-800/60 bg-amber-950/30 text-amber-300",
    critical: "border-rose-800/60 bg-rose-950/30 text-rose-300",
  };
  const icons = {
    info:     <Info className="h-4 w-4 shrink-0 mt-0.5" />,
    warn:     <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
    critical: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />,
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs leading-relaxed ${styles[type]}`}>
      {icons[type]}
      <div>{children}</div>
    </div>
  );
}

function AttrRow({ attr, op, value, kind, desc }: { attr: string; op: string; value: string; kind: "check" | "reply"; desc: string }) {
  return (
    <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-200">{attr}</td>
      <td className="px-2 py-2.5 font-mono text-xs text-indigo-400">{op}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-amber-300">{value}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${kind === "reply" ? "bg-violet-500/15 text-violet-300" : "bg-sky-500/15 text-sky-300"}`}>
          {kind}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-zinc-500">{desc}</td>
    </tr>
  );
}

// ── Main View ─────────────────────────────────────────────────────────

export function LiveAdminDocsView() {
  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-400" />
          <h2 className="theme-text-primary text-xl font-semibold">Documentation</h2>
        </div>
        <p className="theme-text-muted mt-0.5 text-sm">
          Architecture reference, configuration guides, and troubleshooting for operators and administrators.
        </p>
      </div>

      {/* ── Architecture Overview ─────────────────────────────────── */}
      <Section icon={Network} title="Architecture Overview" subtitle="How 802.1X / RADIUS authentication flows" color="text-indigo-400" defaultOpen>
        <p>
          Nexara is a management plane layered on top of FreeRADIUS. It does <strong className="text-white">not</strong> replace
          FreeRADIUS — it configures it. The data flow for every Wi-Fi authentication is:
        </p>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-4 font-mono text-xs text-zinc-300 leading-7">
          <span className="text-zinc-500"># Client → Access Point → FreeRADIUS → Platform API → FreeRADIUS → AP → Client</span><br/>
          <span className="text-sky-400">Supplicant</span>
          <ChevronRight className="inline h-3 w-3 mx-1 text-zinc-600" />
          <span className="text-emerald-400">Access Point (NAS)</span>
          <ChevronRight className="inline h-3 w-3 mx-1 text-zinc-600" />
          <span className="text-violet-400">FreeRADIUS</span>
          <ChevronRight className="inline h-3 w-3 mx-1 text-zinc-600" />
          <span className="text-amber-400">Nexara API (rlm_rest)</span>
          <ChevronRight className="inline h-3 w-3 mx-1 text-zinc-600" />
          <span className="text-violet-400">FreeRADIUS</span>
          <ChevronRight className="inline h-3 w-3 mx-1 text-zinc-600" />
          <span className="text-emerald-400">Access Point</span>
        </div>

        <h4 className="font-semibold text-zinc-100 mt-2">What Nexara manages</h4>
        <ul className="space-y-1.5 list-none pl-0">
          {[
            ["Users & credentials", "NT-Hash for PEAP-MSCHAPv2 stored in DB, synced to radcheck via rlm_rest"],
            ["Device registry", "MAC addresses with per-device approval workflow; EAP-TLS cert fingerprints"],
            ["Groups & VLAN policy", "Group attributes (Tunnel-Type, Tunnel-Private-Group-ID) pushed as reply attributes"],
            ["NAS clients", "Access point/switch shared secrets mirrored to FreeRADIUS nas table"],
            ["EAP-TLS certificates", "CA issues client certs; user-level certs work on any device (MAC-agnostic)"],
            ["Audit & accounting", "All changes logged; RADIUS accounting read from radacct"],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong className="text-zinc-200">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>

        <Note type="info">
          <strong>RadiusPolicyService invariant:</strong> All writes to <code className="bg-zinc-800 px-1 rounded">radcheck</code>, <code className="bg-zinc-800 px-1 rounded">radreply</code>, <code className="bg-zinc-800 px-1 rounded">radusergroup</code>, and <code className="bg-zinc-800 px-1 rounded">nas</code>
          must go through <code className="bg-zinc-800 px-1 rounded">RadiusPolicyService</code>. Never write those tables directly.
        </Note>
      </Section>

      {/* ── Authentication Methods ────────────────────────────────── */}
      <Section icon={Shield} title="Authentication Methods" subtitle="PEAP-MSCHAPv2, EAP-TLS, and how they differ" color="text-violet-400">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* PEAP */}
          <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 p-4">
            <div className="font-semibold text-sky-300 mb-1 flex items-center gap-2">
              <Lock className="h-4 w-4" /> PEAP-MSCHAPv2
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              Username + password authentication inside a TLS tunnel. The most widely supported method.
              No client-side certificate required — just a username, password, and trust of the server cert.
            </p>
            <ul className="text-xs text-zinc-500 space-y-1">
              <li className="flex gap-1.5"><span className="text-emerald-400">✓</span> Works on every OS out-of-the-box</li>
              <li className="flex gap-1.5"><span className="text-emerald-400">✓</span> No certificate distribution needed</li>
              <li className="flex gap-1.5"><span className="text-amber-400">△</span> Password can be phished / leaked</li>
              <li className="flex gap-1.5"><span className="text-amber-400">△</span> Device approval workflow adds MAC enforcement</li>
            </ul>
          </div>
          {/* EAP-TLS */}
          <div className="rounded-lg border border-violet-800/40 bg-violet-950/20 p-4">
            <div className="font-semibold text-violet-300 mb-1 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> EAP-TLS (Certificate)
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              Mutual TLS — client proves identity with a personal certificate; no password involved.
              The platform CA issues client certs; one cert works on all the user's devices.
            </p>
            <ul className="text-xs text-zinc-500 space-y-1">
              <li className="flex gap-1.5"><span className="text-emerald-400">✓</span> Phish-proof — no password in the exchange</li>
              <li className="flex gap-1.5"><span className="text-emerald-400">✓</span> MAC-agnostic: cert binds to user, not device</li>
              <li className="flex gap-1.5"><span className="text-emerald-400">✓</span> Auto-registers the device as approved on first use</li>
              <li className="flex gap-1.5"><span className="text-amber-400">△</span> Requires distributing the .p12 bundle to the client</li>
            </ul>
          </div>
        </div>

        <h4 className="font-semibold text-zinc-100 mt-2">EAP-TLS authorization flow</h4>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-xs font-mono text-zinc-300 space-y-0.5">
          <div><span className="text-zinc-600">1.</span> FreeRADIUS validates the TLS handshake (mutual auth)</div>
          <div><span className="text-zinc-600">2.</span> <span className="text-amber-300">POST /api/v1/radius/authorize</span> with <span className="text-sky-300">authMethod: "eap-tls"</span> + cert fields</div>
          <div><span className="text-zinc-600">3.</span> API looks up cert fingerprint in <span className="text-violet-300">user_client_certs</span></div>
          <div><span className="text-zinc-600">4.</span> Validates user status, cert not revoked, cert not expired</div>
          <div><span className="text-zinc-600">5.</span> Upserts a device record (approved) for the MAC — auto-registers first use</div>
          <div><span className="text-zinc-600">6.</span> Returns group VLAN/reply attributes → FreeRADIUS accepts</div>
        </div>

        <Note type="warn">
          The EAP <strong>server</strong> certificate (in <code className="bg-zinc-800 px-1 rounded">eap.conf</code>) is a different concern from client certificates.
          Upload it in <strong>Settings → EAP Server Certificates</strong> to track its expiry. When it expires, all 802.1X clients will reject the server.
        </Note>
      </Section>

      {/* ── FreeRADIUS Configuration ──────────────────────────────── */}
      <Section icon={Server} title="FreeRADIUS Configuration" subtitle="rlm_rest integration snippets" color="text-amber-400">
        <p>
          FreeRADIUS delegates authorization and post-auth to Nexara via <code className="bg-zinc-800 px-1 rounded text-zinc-200">rlm_rest</code>.
          Below are the minimal configuration snippets. Adjust paths and values for your deployment.
        </p>

        <h4 className="font-semibold text-zinc-200">1 · <code className="text-amber-300">mods-available/rest</code></h4>
        <CodeBlock language="freeradius" code={`rest {
  connect_uri = "http://127.0.0.1:3001"

  authorize {
    uri   = "\${..connect_uri}/api/v1/radius/authorize?s=\${ENV:RADIUS_HOOK_SECRET}"
    method = "POST"
    body   = "json"
    data   = '{ "username": "%{User-Name}", "mac": "%{Calling-Station-Id}", "nasIp": "%{NAS-IP-Address}" }'
    tls = \${..tls}
  }

  post-auth {
    uri   = "\${..connect_uri}/api/v1/radius/post-auth?s=\${ENV:RADIUS_HOOK_SECRET}"
    method = "POST"
    body   = "json"
    data   = '{ "username": "%{User-Name}", "mac": "%{Calling-Station-Id}", "nasIp": "%{NAS-IP-Address}" }'
    tls = \${..tls}
  }
}`} />

        <h4 className="font-semibold text-zinc-200 mt-2">2 · <code className="text-amber-300">sites-available/default</code> (authorize section)</h4>
        <CodeBlock language="freeradius" code={`authorize {
    filter_username
    preprocess
    suffix
    eap {
        ok = return
    }
    rest          # <-- calls /api/v1/radius/authorize
    expiration
    logintime
}`} />

        <h4 className="font-semibold text-zinc-200 mt-2">3 · EAP-TLS inner tunnel — pass cert fields</h4>
        <CodeBlock language="freeradius" code={`# In mods-available/rest, inside the EAP-TLS authorize block:
authorize {
  uri   = "\${..connect_uri}/api/v1/radius/authorize?s=\${ENV:RADIUS_HOOK_SECRET}"
  method = "POST"
  body   = "json"
  data   = '{
    "authMethod": "eap-tls",
    "mac":         "%{Calling-Station-Id}",
    "nasIp":       "%{NAS-IP-Address}",
    "certSubject": "%{TLS-Client-Cert-Subject}",
    "certIssuer":  "%{TLS-Client-Cert-Issuer}",
    "certSerial":  "%{TLS-Client-Cert-Serial}",
    "certCommonName": "%{TLS-Client-Cert-Common-Name}",
    "certEmail":   "%{TLS-Client-Cert-Subject-Alt-Name-Email}"
  }'
}`} />

        <h4 className="font-semibold text-zinc-200 mt-2">4 · Environment variables</h4>
        <CodeBlock language="shell" code={`# .env on the API server
DATABASE_URL="postgresql://user:pass@localhost:5432/radius"
JWT_SECRET="generate-with: openssl rand -hex 48"
RADIUS_HOOK_SECRET="generate-with: openssl rand -hex 32"
RADIUS_IP_GUARD_ENABLED=true    # set false in dev, true in prod

# Optional Telegram notifications
# Set via admin Settings panel — stored in DB, env is fallback only
# TELEGRAM_BOT_TOKEN="..."
# TELEGRAM_ADMIN_CHAT_ID="..."`} />

        <Note type="warn">
          <strong>Rotate secrets on first deploy.</strong> <code className="bg-zinc-800 px-1 rounded">JWT_SECRET</code> signs all access tokens; <code className="bg-zinc-800 px-1 rounded">RADIUS_HOOK_SECRET</code> authenticates FreeRADIUS callbacks.
          Both must be cryptographically random (≥32 bytes) and never shared.
        </Note>
      </Section>

      {/* ── Group Attributes Reference ────────────────────────────── */}
      <Section icon={Layers} title="Group Policy Attributes" subtitle="RADIUS attributes available for group policy" color="text-emerald-400">
        <p>
          Add these attributes to a group via <strong>Groups &amp; Policy → edit group → Add Attribute</strong>.
          <code className="bg-zinc-800 px-1 rounded text-zinc-200 ml-1">reply</code> attributes are sent back to the NAS (VLAN assignment, etc.).
          <code className="bg-zinc-800 px-1 rounded text-zinc-200 ml-1">check</code> attributes are evaluated server-side.
        </p>

        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-medium">Attribute</th>
                <th className="px-2 py-2.5 font-medium">Op</th>
                <th className="px-4 py-2.5 font-medium">Example Value</th>
                <th className="px-3 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <AttrRow attr="Tunnel-Type"              op=":=" value="VLAN"   kind="reply" desc="Required for 802.1Q VLAN assignment. Always set with the next two." />
              <AttrRow attr="Tunnel-Medium-Type"       op=":=" value="IEEE-802" kind="reply" desc="Required for 802.1Q. Use with Tunnel-Type." />
              <AttrRow attr="Tunnel-Private-Group-ID"  op=":=" value="30"     kind="reply" desc="The VLAN ID (number as string). This is the one you change per group." />
              <AttrRow attr="Session-Timeout"          op=":=" value="28800"  kind="reply" desc="Max session length in seconds (e.g. 28800 = 8 h). Not set = unlimited." />
              <AttrRow attr="Idle-Timeout"             op=":=" value="1800"   kind="reply" desc="Disconnect after N seconds of inactivity." />
              <AttrRow attr="Simultaneous-Use"         op=":=" value="3"      kind="check" desc="Max concurrent sessions for the same username." />
              <AttrRow attr="Filter-Id"                op=":=" value="GuestPolicy" kind="reply" desc="ACL or policy name forwarded to the NAS (vendor-specific)." />
              <AttrRow attr="Class"                    op=":=" value="staff"  kind="reply" desc="Free-form string carried back for NAS-side classification." />
            </tbody>
          </table>
        </div>

        <Note type="info">
          The platform automatically completes the mandatory VLAN triple — if you add
          <code className="bg-zinc-800 px-1 rounded mx-1">Tunnel-Private-Group-ID</code> only, the other two are filled in automatically during authorization.
        </Note>
      </Section>

      {/* ── Certificate Workflow ──────────────────────────────────── */}
      <Section icon={Lock} title="Certificate Workflow" subtitle="CA, EAP server cert, and user client certs" color="text-sky-400">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-zinc-200 mb-1">Certificate Authority (CA)</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Go to <strong className="text-zinc-300">Settings → Certificate Authority</strong>.
              Either upload your own CA cert + key (recommended for production) or click <em>Regenerate dev CA</em> to auto-generate a self-signed CA.
              The CA is used to issue EAP-TLS client certificates for users.
              It is also served as the downloadable "WiFi CA" in the user portal.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-zinc-200 mb-1">EAP Server Certificate (RADIUS server cert)</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This is the TLS certificate FreeRADIUS presents to clients during the EAP handshake —
              configured in <code className="bg-zinc-800 px-1 rounded">eap.conf → certificate_file</code>.
              Nexara does <em>not</em> manage this cert on disk; it only tracks its metadata.
              Upload the public PEM in <strong className="text-zinc-300">Settings → EAP Server Certificates</strong> to get expiry alerts and the Windows thumbprint.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-zinc-200 mb-1">User Client Certificates</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Provision per-user EAP-TLS certificates from a user's detail drawer (<strong className="text-zinc-300">Users → edit user → WiFi Certificate</strong>).
              The platform CA signs the cert; the .p12 bundle is shown once and can be re-downloaded (public cert only) from the cert list.
              Users can also provision their own cert from the self-service portal (<strong className="text-zinc-300">My Account → WiFi Cert</strong>).
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-zinc-200 mt-2">Expiry alert thresholds</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "> 60 days", color: "bg-emerald-500/15 text-emerald-300 border-emerald-800/40", badge: "OK" },
            { label: "≤ 60 days", color: "bg-amber-500/15 text-amber-300 border-amber-800/40", badge: "60d warning" },
            { label: "≤ 30 days", color: "bg-orange-500/15 text-orange-300 border-orange-800/40", badge: "30d warning" },
            { label: "≤ 7 days", color: "bg-rose-500/15 text-rose-300 border-rose-800/40", badge: "CRITICAL" },
          ].map((t) => (
            <div key={t.badge} className={`rounded-lg border px-3 py-2 text-center ${t.color}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider">{t.badge}</div>
              <div className="text-xs mt-1">{t.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Troubleshooting ───────────────────────────────────────── */}
      <Section icon={Terminal} title="Troubleshooting" subtitle="Common issues and diagnostic steps" color="text-rose-400">
        <div className="space-y-5">
          {[
            {
              q: "All 802.1X clients are rejected / cannot connect",
              steps: [
                "Check FreeRADIUS logs: journalctl -u freeradius -f",
                "Verify RADIUS_HOOK_SECRET matches in FreeRADIUS config and API .env",
                "Check EAP server certificate expiry in Settings → EAP Server Certificates",
                "Ensure the API is reachable from FreeRADIUS: curl http://127.0.0.1:3001/api/v1/health",
                "Check if RADIUS_IP_GUARD_ENABLED=true and FreeRADIUS IP is in the allowlist",
              ],
            },
            {
              q: "PEAP authentication fails for one user (correct password)",
              steps: [
                "Check user status in Users — must be 'active'",
                "Verify user account validity dates (validFrom / validUntil)",
                "Check if device is pending approval (Device Approvals view)",
                "Try resetting the password — NT-Hash may be out of sync",
                "Check auth events: Audit Log → filter by username",
              ],
            },
            {
              q: "EAP-TLS client cert is rejected",
              steps: [
                "Verify the cert was provisioned and not revoked (Users → user → WiFi Certificate)",
                "Check cert expiry date in the cert list",
                "Confirm the CA in Settings → CA matches what signed the client cert",
                "Make sure FreeRADIUS has the CA cert in its ca_file / ca_path",
                "Run: openssl verify -CAfile /etc/freeradius/ca.pem /path/to/client.pem",
              ],
            },
            {
              q: "VLAN is not assigned / client lands on wrong VLAN",
              steps: [
                "Check the user's group membership (Users → Groups tab)",
                "Verify the group has Tunnel-Type, Tunnel-Medium-Type, and Tunnel-Private-Group-ID attributes",
                "Check FreeRADIUS reply attributes in debug mode: radiusd -X",
                "Ensure the NAS (AP/switch) supports 802.1Q VLAN tagging via RADIUS",
              ],
            },
            {
              q: "Telegram notifications not arriving",
              steps: [
                "Verify bot token and chat ID in Settings → Telegram",
                "The bot must have started a conversation with the admin chat first",
                "Test: send a message to the bot, then check @userinfobot for your chat ID",
                "Check API logs for Telegram send errors",
              ],
            },
          ].map(({ q, steps }) => (
            <div key={q}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="font-medium text-zinc-100">{q}</span>
              </div>
              <ol className="ml-6 space-y-1">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="text-zinc-600 tabular-nums shrink-0">{i + 1}.</span>
                    <code className="text-zinc-300">{s}</code>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-zinc-200 mt-2">Useful diagnostic commands</h4>
        <CodeBlock language="shell" code={`# FreeRADIUS debug mode (verbose auth trace)
sudo radiusd -X

# Test a PEAP authentication from the server
radtest -t mschap username password 127.0.0.1 0 testing123

# Check API health
curl -s http://localhost:3001/api/v1/health | jq .

# Check DB connection
psql $DATABASE_URL -c "SELECT count(*) FROM users;"

# Rotate RADIUS hook secret (update both .env and FreeRADIUS config, then restart both)
openssl rand -hex 32`} />
      </Section>

      {/* ── Database Schema Quick Ref ─────────────────────────────── */}
      <Section icon={Database} title="Database Reference" subtitle="Key tables and their purpose" color="text-zinc-400">
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-medium">Table</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {[
                ["users", "Nexara", "Application users with role, status, validity dates, MFA"],
                ["user_secrets", "Nexara", "NT-Hash + Argon2id hash — separate sensitivity table"],
                ["user_devices", "Nexara", "MAC registry with approval status and EAP-TLS fingerprint"],
                ["user_client_certs", "Nexara", "EAP-TLS client cert metadata; CA-issued, one per user"],
                ["groups", "Nexara", "Policy groups with RADIUS attributes"],
                ["group_attributes", "Nexara", "Per-group RADIUS check / reply attributes"],
                ["nas_clients", "Nexara", "Access point shared secrets"],
                ["sites", "Nexara", "Physical locations grouping NAS clients"],
                ["eap_certificates", "Nexara", "EAP server cert inventory (metadata + expiry tracking)"],
                ["platform_settings", "Nexara", "Key-value runtime config (Telegram, CA PEM)"],
                ["audit_logs", "Nexara", "Immutable admin action log"],
                ["radcheck", "FreeRADIUS", "Derived — written by RadiusPolicyService only"],
                ["radreply", "FreeRADIUS", "Derived — written by RadiusPolicyService only"],
                ["radusergroup", "FreeRADIUS", "Derived — written by RadiusPolicyService only"],
                ["nas", "FreeRADIUS", "Derived — mirrored from nas_clients by RadiusPolicyService"],
                ["radacct", "FreeRADIUS", "RADIUS accounting records — read-only in Nexara"],
              ].map(([table, owner, purpose]) => (
                <tr key={table} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{table}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${owner === "Nexara" ? "bg-indigo-500/15 text-indigo-300" : "bg-zinc-500/15 text-zinc-400"}`}>
                      {owner}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── API Reference ─────────────────────────────────────────── */}
      <Section icon={Code2} title="REST API Reference" subtitle="Key endpoints for integrations and automation" color="text-sky-400">
        <p className="text-xs text-zinc-400">
          All endpoints are under <code className="bg-zinc-800 px-1 rounded text-zinc-200">/api/v1</code>.
          Authenticate with <code className="bg-zinc-800 px-1 rounded text-zinc-200">Authorization: Bearer &lt;accessToken&gt;</code>.
          Admin endpoints require role <code className="bg-zinc-800 px-1 rounded text-zinc-200">admin</code>.
        </p>

        <div className="space-y-3">
          {[
            { group: "Auth",         color: "bg-sky-500/15 text-sky-300",    endpoints: [
              ["POST", "/auth/login",           "Authenticate — returns access token"],
              ["POST", "/me/password",          "Self-service password change"],
              ["GET",  "/me/mfa",               "MFA status"],
            ]},
            { group: "Users",        color: "bg-indigo-500/15 text-indigo-300", endpoints: [
              ["GET",    "/admin/users",              "List users (paginated, filterable)"],
              ["POST",   "/admin/users",              "Create user"],
              ["PATCH",  "/admin/users/:id",          "Update user"],
              ["DELETE", "/admin/users/:id",          "Delete user"],
              ["GET",    "/admin/users/:id/certs",    "List user EAP-TLS certs"],
              ["POST",   "/admin/users/:id/provision-cert", "Provision user EAP-TLS cert"],
            ]},
            { group: "Groups",       color: "bg-violet-500/15 text-violet-300", endpoints: [
              ["GET",    "/admin/groups",              "List groups"],
              ["POST",   "/admin/groups",              "Create group"],
              ["POST",   "/admin/groups/:id/attributes", "Add attribute"],
              ["DELETE", "/admin/groups/:id/attributes/:attrId", "Remove attribute"],
            ]},
            { group: "EAP Certs",    color: "bg-amber-500/15 text-amber-300", endpoints: [
              ["GET",    "/admin/certs",              "List EAP server certificates"],
              ["POST",   "/admin/certs",              "Add certificate (PEM body)"],
              ["POST",   "/admin/certs/:id/activate", "Mark as active"],
              ["DELETE", "/admin/certs/:id",          "Delete (non-active only)"],
            ]},
            { group: "RADIUS Hooks", color: "bg-rose-500/15 text-rose-300", endpoints: [
              ["POST", "/radius/authorize",  "Called by FreeRADIUS — returns NT-Password / policy"],
              ["POST", "/radius/post-auth",  "Called by FreeRADIUS — registers new MAC devices"],
            ]},
          ].map(({ group, color, endpoints }) => (
            <div key={group}>
              <div className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded mb-2 ${color}`}>{group}</div>
              <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
                {endpoints.map(([method, path, desc]) => (
                  <div key={path} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`text-[10px] font-bold uppercase w-14 shrink-0 ${
                      method === "GET" ? "text-emerald-400" :
                      method === "POST" ? "text-sky-400" :
                      method === "PATCH" ? "text-amber-400" : "text-rose-400"
                    }`}>{method}</span>
                    <code className="text-xs text-zinc-200 font-mono flex-1 min-w-0 truncate">{path}</code>
                    <span className="text-xs text-zinc-600 hidden sm:block">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Release Notes ─────────────────────────────────────────── */}
      <Section icon={FileText} title="Platform Notes" subtitle="Design decisions and known constraints" color="text-zinc-400">
        <ul className="space-y-2">
          {[
            "Session-Timeout is not set by default — sessions are unlimited unless you add it as a group attribute.",
            "All users (role: admin or user) get WiFi access via RADIUS. Role only controls dashboard permissions — use Groups to assign VLAN / bandwidth / timeout policies.",
            "Device approval is optional (DEVICE_APPROVAL_REQUIRED env). When disabled, any MAC is accepted for active users.",
            "The platform does not manage FreeRADIUS on disk (no file writes, no restarts). Only the database bridge (radcheck/radreply/nas) is managed.",
            "SAML SSO is supported for portal login only — RADIUS authentication always uses native credentials (NT-Hash or client cert).",
            "Telegram approvals are bidirectional: a decision in the dashboard edits the Telegram message, and vice versa.",
            "The audit log is append-only and cannot be cleared from the UI — this is intentional for compliance.",
          ].map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
              <Wifi className="h-3.5 w-3.5 text-zinc-600 shrink-0 mt-0.5" />
              {note}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
