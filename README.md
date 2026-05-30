<div align="center">

<img src="docs/logo.svg" alt="Nexara Logo" width="80" height="80" />

# Nexara

### The Intelligent Nexus of Enterprise Wi-Fi Access Control

> **Nexa** — from *Nexus*, the connection point where every user meets the network  
> **-ra** — from *aura*, the invisible field of trust that surrounds every authorized device

**Nexara** is a self-hosted, production-grade 802.1X Wi-Fi access control platform — combining RADIUS authentication, real-time device management, certificate-based identity, and group policy enforcement into a single intelligent control layer between your wireless infrastructure and your users.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev)
[![FreeRADIUS](https://img.shields.io/badge/FreeRADIUS-3.2-CC0000?style=flat-square)](https://freeradius.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Md.%20Asiqur%20Rahman%20Khan-0969da?style=flat-square&logo=github&logoColor=white)](https://github.com/asiqur-rahman)

[What is Nexara?](#-what-is-nexara) · [Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Configuration](#-configuration) · [API](#-api-reference) · [Deployment](#-production-deployment)

---

*Developed and maintained by **[Md. Asiqur Rahman Khan](https://github.com/asiqur-rahman)***

</div>

---

## 💡 What is Nexara?

Every Wi-Fi network has a question it must answer for every device that tries to connect:

> ***"Should this device be allowed on the network — and if so, under what rules?"***

**Nexara** is the system that answers that question, at scale, in real time, without a commercial controller.

It sits as an intelligent layer between your wireless access points and your users. When a device connects, Nexara authenticates it via industry-standard 802.1X (using a username/password or a personal certificate), checks whether it has been approved by an administrator, determines which policy group it belongs to, and signals the access point to put it on the right VLAN with the right bandwidth limits — all within milliseconds.

```
A device connects to Wi-Fi
        ↓
Nexara asks: Is this user known? Is the device approved? What group are they in?
        ↓
Access Point receives the answer: VLAN 100 · 50 Mbps · Session 8h
        ↓
User is on the network — with exactly the access they are entitled to
```

### What makes Nexara different from just running FreeRADIUS?

FreeRADIUS is the engine. **Nexara is the car.**

Raw FreeRADIUS requires writing configuration files, manually editing database rows, building your own admin tooling, and integrating your own notification system. Nexara wraps FreeRADIUS with a complete management platform:

| Raw FreeRADIUS | Nexara |
|---|---|
| Edit `.conf` files to add users | Create users in a web dashboard in seconds |
| Write SQL to assign VLAN attributes | Pick a preset: "Guest · VLAN 100 · 10 Mbps · 4h" |
| No device approval workflow | New devices held in a Pending queue with Telegram notifications |
| No certificate management UI | Built-in CA, per-user cert issuance, password-protected `.p12` download |
| No audit trail | Every admin action and RADIUS event logged with actor and timestamp |
| No real-time monitoring | Live dashboard: active sessions, auth trends, NAS health, reject spikes |
| Requires Linux expertise to operate | Runs anywhere Docker runs — one command, full stack |

### Who is Nexara for?

- **IT teams** managing enterprise Wi-Fi for companies, hospitals, schools, or campuses
- **MSPs** running Wi-Fi infrastructure for multiple client sites
- **Security engineers** who need per-device VLAN isolation and certificate-based auth
- **Developers** who want to understand or extend a production-grade 802.1X stack

### The name

**Nexara** = *Nexus* (the connection point — the meeting place of every user and the network) + *-ra* (from *aura*, the invisible field of trust that surrounds every authorized device, just as a Wi-Fi signal invisibly surrounds a space).

Every device that connects through Nexara is not just authenticated — it is *enveloped in a trusted aura*, assigned its identity, and placed exactly where it belongs.

---

## Overview

**Use Nexara when you need to:**
- Authenticate Wi-Fi users with **usernames/passwords (PEAP)** or **certificates (EAP-TLS)**
- Assign **VLANs and bandwidth limits** per user group automatically on connect
- **Approve, reject, or permanently block** devices before they touch the network
- Give users a **self-service portal** to manage their own devices and certificates
- Get **real-time alerts** via Telegram when devices request access or certificates near expiry
- Keep a full **audit trail** of every admin action and RADIUS authentication event
- Run everything **on your own infrastructure** — no cloud dependency, no vendor lock-in

---

## ✨ Features

### 🔐 Authentication & Access

| Feature | Details |
|---|---|
| **PEAP-MSCHAPv2** | Standard username + password Wi-Fi authentication |
| **EAP-TLS (passwordless)** | Certificate-based auth — no passwords, just certs |
| **Per-user certificate access** | Enable or disable EAP-TLS per user account |
| **MFA (TOTP)** | Authenticator-app 2FA for admin dashboard logins |
| **LDAP / SAML SSO** | Sync users from Active Directory or any SAML IdP |
| **JWT + refresh cookies** | Secure, rotating session management |
| **Login lockout** | Rate-limited brute-force protection with configurable threshold |
| **HIBP password check** | Optional Have I Been Pwned breach screening on password set |

### 📱 Device & NAC

| Feature | Details |
|---|---|
| **Device approval workflow** | New devices are held in a Pending queue until an admin acts |
| **Accept / Reject / Block** | Accept = access, Reject = denied but can re-apply, Block = permanent MAC ban |
| **MAC OUI identification** | Automatically identifies manufacturer and device type (laptop/mobile/IoT/printer…) from MAC address |
| **Last-seen IP tracking** | Real-time IP address stored from RADIUS accounting records |
| **Self-service device portal** | Users register, label, and manage their own devices |
| **Device type badges** | Visual icons and manufacturer labels in the admin view |
| **CoA (Change of Authorization)** | Instantly pushes policy changes to connected sessions without reconnect |
| **Quarantine VLAN** | Route unapproved devices to an isolated VLAN instead of rejecting outright |

### 🗂 Groups & Policy

| Feature | Details |
|---|---|
| **VLAN assignment** | Assign any VLAN per group via Tunnel-Type / Tunnel-Private-Group-ID (RFC 2868) |
| **Bandwidth limits** | Per-group download/upload caps via WISPr-Bandwidth-Max-Down/Up |
| **Session & idle timeouts** | Configurable Session-Timeout and Idle-Timeout per group |
| **Policy presets** | One-click presets: Corporate Staff, Guest, IoT, Restricted, Management, Secure Guest |
| **Vendor-specific attributes** | MikroTik Rate-Limit, Cisco AVPair, Aruba User-Role and more |
| **Advanced attribute editor** | Set any RADIUS reply/check attribute with any FreeRADIUS operator |
| **One group per user** | Each user belongs to exactly one policy group (enforced at API level) |
| **Default group apply** | Assign a default policy preset at group creation time |

### 🏛 Certificate Authority (EAP-TLS PKI)

| Feature | Details |
|---|---|
| **Built-in CA** | Auto-generates a platform CA on first use — no external PKI required |
| **Custom CA upload** | Upload your own CA certificate and private key via the admin panel |
| **Per-user WiFi certs** | Admin or users generate personal `.p12` certificates for EAP-TLS auth |
| **PKCS12 password storage** | Password encrypted (AES-256-GCM) and retrievable from cert list at any time |
| **One cert per user** | Generating a new cert replaces the old one atomically |
| **Self-service toggle** | Admin can disable user self-service cert generation globally |
| **EAP server cert management** | Track, activate, and monitor FreeRADIUS EAP server certificates with expiry alerts |
| **Certificate expiry alerts** | Warn at 60, 30, and 7 days before expiry |

### 📊 Monitoring & Operations

| Feature | Details |
|---|---|
| **Real-time dashboard** | Live auth accept/reject trends, NAS status, active session counts |
| **Live sessions view** | Search and disconnect active RADIUS sessions |
| **NAS silence alerts** | Alert when an access point stops sending accounting data |
| **Reject spike alerts** | Alert when failed authentications exceed a configurable threshold |
| **Audit log** | Every admin action logged with actor, timestamp, and change details |
| **RADIUS event log** | Combined login and RADIUS auth event history |
| **Server-sent events (SSE)** | Admin dashboard updates in real time — no polling |
| **Notification sounds** | Browser notification sound on new device pending approval |

### 🔔 Telegram Integration

| Feature | Details |
|---|---|
| **New device notifications** | Instant Telegram message when a device requests access |
| **Inline approval** | Approve or reject directly from Telegram with inline buttons |
| **Decision sync** | Web dashboard and Telegram stay in sync — approving in one reflects in the other |
| **Configuration** | Bot token and chat ID configured from the admin panel — no env restart needed |

### 🛡 Security & RBAC

| Feature | Details |
|---|---|
| **Role-based access** | Admin gets full dashboard, User gets self-service portal only |
| **Admin self-protection** | Admin cannot change their own role or suspend their own account |
| **Last-admin protection** | Cannot demote or delete the last remaining admin account |
| **RADIUS IP Guard** | Optional allowlist restricting which NAS IPs may send RADIUS requests |
| **Direct MSCHAPv2 toggle** | Allow or block password auth independent of PEAP wrapper |
| **Device approval gate** | New devices blocked until admin explicitly approves them |
| **Encrypted secrets** | TOTP seeds and PKCS12 passwords encrypted at rest (AES-256-GCM) |
| **Refresh token revocation** | Tokens revoked on logout and password change |

### 🏗 Infrastructure

| Feature | Details |
|---|---|
| **Docker Compose** | Single command to bring up the full stack (Postgres + FreeRADIUS + API + Web) |
| **Layered compose files** | `db` / `radius` / `app` layers composable for partial deployments |
| **Prisma migrations** | Versioned, auditable database schema evolution |
| **pnpm workspaces** | Monorepo with shared TypeScript types between API and web |
| **NAS client management** | Add, edit, rotate secrets for access points from the dashboard |
| **Sites** | Logical grouping of NAS clients by location/site |
| **Health endpoints** | `/health/live` and `/health/ready` for container orchestration |
| **PWA support** | Installable progressive web app for mobile admin access |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                              │
│  Admin Dashboard (React)    User Portal (React)             │
│  HTTPS / WS / SSE           HTTPS                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST / JWT
┌──────────────────────────▼──────────────────────────────────┐
│                    API Layer (Fastify)                       │
│  /admin/*  RBAC-protected     /me/*  Ownership-checked      │
│  /radius/* Hook-secret auth   /api/v1/health  Public        │
│                                                             │
│  RadiusPolicyService ← single writer of RADIUS tables       │
└────────┬─────────────────────────────┬───────────────────────┘
         │ SQL (radcheck/radreply/nas)  │ SQL (users/devices/groups)
┌────────▼───────────┐       ┌─────────▼──────────────────────┐
│   FreeRADIUS 3.2   │       │       PostgreSQL 16             │
│  rlm_rest → API    │       │  App schema + RADIUS tables     │
│  EAP, PEAP, TLS    │       │  (same DB, separate schemas)    │
└────────────────────┘       └────────────────────────────────┘
         ▲
         │ 802.1X / RADIUS UDP 1812/1813
┌────────┴───────────┐
│  Access Points     │
│  (any 802.1X AP)   │
└────────────────────┘
```

### Key design decisions

- **RadiusPolicyService** is the only writer of `radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, and `nas`. All mutations are transactional with application tables.
- **FreeRADIUS calls the API** via `rlm_rest` on every `authorize` and `post-auth` — no direct DB coupling between FreeRADIUS and the application schema.
- **Platform settings** (CA, Telegram, cert subjects, NAC policy) live in the `platform_settings` table — configurable at runtime from the admin panel without restarting services.

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Docker + Docker Compose | v2.20+ |
| Node.js | 20+ |
| pnpm | 9+ |

```bash
# Clone and install
git clone https://github.com/your-org/radiusops.git
cd radiusops
pnpm install
```

### 1 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set **at minimum** these three secrets before starting:

```env
JWT_SECRET=<random 32+ chars>
COOKIE_SECRET=<random 32+ chars>
MFA_ENCRYPTION_KEY=<random 32+ chars>
```

> All other values have safe defaults for local development. See [Configuration](#-configuration) for the full reference.

### 2 — Start the stack

```bash
# Postgres + FreeRADIUS + API + Web (full stack)
docker compose up -d

# Run database migrations and seed the first admin account
pnpm db:deploy
pnpm db:seed
```

### 3 — Open the dashboard

```
http://localhost:8123
```

Default credentials: `admin` / `admin1234!`  
**Change immediately** in Admin → Users → Edit.

### 4 — Point your access point

Configure your AP's RADIUS settings:

| Field | Value |
|---|---|
| RADIUS Server | `<your-server-ip>` |
| Authentication Port | `1812` |
| Accounting Port | `1813` |
| Shared Secret | value of `RADIUS_HOOK_SECRET` in `.env` |

Run `pnpm lab:config` to print exact values for your environment.

---

## 🗂 Repository Layout

```
radiusops/
├── apps/
│   ├── api/                    Fastify 5 + Prisma 5 API server
│   │   ├── prisma/             Schema, migrations, seed
│   │   └── src/
│   │       ├── routes/         HTTP route handlers (admin/, me/, radius/, …)
│   │       ├── services/       RadiusPolicyService, CoA, cert issuance
│   │       └── lib/            CA, OUI lookup, encryption, Telegram, …
│   └── web/                    React 18 + Vite + Tailwind frontend
│       └── src/
│           ├── pages/          AdminDashboard, ClientPortal, Login
│           ├── views/          Feature views (devices, groups, certs, …)
│           └── components/     Shared UI components
├── packages/
│   └── shared/                 TypeScript types shared between API and web
├── infra/
│   ├── postgres/init/          DB bootstrap SQL (schema + roles)
│   └── freeradius/raddb/       FreeRADIUS 3.x configuration overlay
├── ops/                        Lab tools (cert gen, readiness check, …)
├── docker-compose.db.yml       PostgreSQL service
├── docker-compose.radius.yml   FreeRADIUS service
├── docker-compose.app.yml      API + Web services
└── .env.example                Environment template
```

---

## ⚙ Configuration

All configuration lives in `.env`. Runtime settings (Telegram, CA certificate, cert subjects, NAC policy) are stored in the database and configurable from Admin → Settings without a restart.

### Required secrets

```env
# Signs access tokens — change before production (min 32 chars)
JWT_SECRET=

# Signs session cookies — change before production (min 32 chars)
COOKIE_SECRET=

# Encrypts TOTP seeds and PKCS12 passwords — NEVER rotate after first use (min 32 chars)
MFA_ENCRYPTION_KEY=

# Shared secret between FreeRADIUS and the API hook
RADIUS_HOOK_SECRET=
```

### Database

```env
DATABASE_URL=postgresql://app_user:password@localhost:5433/radius?schema=public
POSTGRES_PORT=5433
```

### FreeRADIUS

```env
# CN for the auto-generated EAP server certificate
RADIUS_CERT_CN=radius.yourdomain.com

# Allow direct MSCHAPv2 (true = useful for testing; false = production default)
ALLOW_DIRECT_MSCHAP=false

# Block unapproved devices (true = recommended for production)
DEVICE_APPROVAL_REQUIRED=true

# Enforce RADIUS IP allowlist (configure IPs in Admin → Settings → RADIUS IP Guard)
RADIUS_IP_GUARD_ENABLED=false
```

### CoA (Change of Authorization)

```env
COA_TIMEOUT_MS=2000
COA_DISCONNECT_ON_PASSWORD_CHANGE=true
COA_DISCONNECT_ON_USER_POLICY_CHANGE=true
COA_DISCONNECT_ON_GROUP_POLICY_CHANGE=false
```

### Alert thresholds

```env
# Alert if a NAS stops sending accounting for this many minutes
ALERT_NAS_SILENT_MINUTES=15

# Alert if more than N auth rejections occur in a 5-minute window
ALERT_REJECT_THRESHOLD_5M=20
```

> **Runtime-only settings** (no env var needed):  
> Telegram bot, CA certificate, cert subject fields, NAC quarantine policy → Admin → Settings

---

## 📡 API Reference

Base URL: `http://localhost:4000/api/v1`

All authenticated endpoints require `Authorization: Bearer <token>` or a valid `refreshToken` cookie.

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Login with username + password (+ TOTP if enabled) |
| `POST` | `/auth/refresh` | Silently refresh access token via cookie |
| `POST` | `/auth/logout` | Revoke refresh token |

### Admin — Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List users with pagination and search |
| `POST` | `/admin/users` | Create user |
| `PATCH` | `/admin/users/:id` | Update user (role, status, group, certEnabled, …) |
| `DELETE` | `/admin/users/:id` | Suspend user |
| `POST` | `/admin/users/:id/reset-password` | Force password reset |
| `POST` | `/admin/users/:id/provision-cert` | Issue EAP-TLS certificate for user |
| `GET` | `/admin/users/:id/certs` | List user's certificates |
| `DELETE` | `/admin/users/:id/certs/:certId` | Delete user certificate |

### Admin — Devices

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/devices` | List all devices (filter by status, search) |
| `GET` | `/admin/users/:id/devices` | List devices for a specific user |
| `PATCH` | `/admin/devices/:id` | Accept / Reject / Block a device |
| `DELETE` | `/admin/devices/:id` | Permanently delete a device record |

### Admin — Groups & Policy

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/groups` | List all groups with attributes |
| `POST` | `/admin/groups` | Create group |
| `PATCH` | `/admin/groups/:id` | Update group metadata |
| `DELETE` | `/admin/groups/:id` | Delete group |
| `PUT` | `/admin/groups/:id/policy` | Set VLAN + bandwidth + session policy atomically |
| `POST` | `/admin/groups/:id/attributes` | Add RADIUS attribute |
| `DELETE` | `/admin/groups/:id/attributes/:attrId` | Remove RADIUS attribute |

### Admin — Platform Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/settings/platform` | Get all platform settings |
| `PUT` | `/admin/settings/platform` | Update Telegram, CA, cert settings, FreeRADIUS reload |

### Self-Service (authenticated users)

| Method | Path | Description |
|---|---|---|
| `GET` | `/me/certs` | List own certificates (includes decrypted PKCS12 password) |
| `POST` | `/me/certs/provision` | Generate personal Wi-Fi certificate |
| `DELETE` | `/me/certs/:certId` | Delete own certificate |
| `GET` | `/me/devices` | List own devices |
| `POST` | `/me/devices` | Register a device |
| `PATCH` | `/me/devices/:id` | Rename device / set as primary |
| `DELETE` | `/me/devices/:id` | Remove device (requires password) |
| `GET` | `/me/sessions` | View own active RADIUS sessions |

### RADIUS Hooks (FreeRADIUS internal)

Protected by `X-Radius-Hook-Secret` / `?s=` query parameter.

| Method | Path | Description |
|---|---|---|
| `POST` | `/radius/authorize` | PEAP and EAP-TLS authorization hook |
| `POST` | `/radius/post-auth` | Post-authentication device registration hook |

---

## 🌐 Production Deployment

### Docker Compose (recommended)

```bash
# 1. Set production values in .env
#    - Strong JWT_SECRET, COOKIE_SECRET, MFA_ENCRYPTION_KEY
#    - Real RADIUS_CERT_CN (your public hostname)
#    - DEVICE_APPROVAL_REQUIRED=true
#    - NODE_ENV=production

# 2. Deploy
docker compose up -d --build

# 3. Run migrations
docker compose exec api node ./node_modules/prisma/build/index.js migrate deploy

# 4. Seed first admin (first run only)
docker compose exec api node dist/seed.js
```

### Reverse proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name radius.yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:8123;
        proxy_set_header Host $host;
    }

    # SSE — disable buffering
    location /api/v1/events {
        proxy_pass http://localhost:4000;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding on;
    }
}
```

### Production checklist

- [ ] Change default admin password immediately after seed
- [ ] Set strong `JWT_SECRET`, `COOKIE_SECRET`, `MFA_ENCRYPTION_KEY` (32+ random chars each)
- [ ] Set `RADIUS_CERT_CN` to your public hostname
- [ ] Set `NODE_ENV=production`
- [ ] Set `DEVICE_APPROVAL_REQUIRED=true`
- [ ] Enable MFA for admin accounts (Admin → Settings → Security)
- [ ] Upload or generate CA certificate (Admin → Settings → CA Certificate)
- [ ] Configure Telegram bot for device approval notifications (Admin → Settings → Telegram)
- [ ] Enable RADIUS IP Guard for NAS allowlisting (Admin → Settings → RADIUS IP Guard)
- [ ] Set `COOKIE_SECURE=true` when served over HTTPS
- [ ] Run `pnpm lab:check` to verify all services are reachable

---

## 🔧 Development

### Local dev without Docker

```bash
# Start only Postgres and FreeRADIUS in Docker
pnpm docker:up

# Run API and web in watch mode
pnpm dev
```

### Useful scripts

```bash
pnpm lab:check          # Verify full stack readiness
pnpm lab:config         # Print RADIUS/AP config values
pnpm lab:device-ca      # Generate a dev EAP-TLS CA
pnpm lab:client-cert    # Issue a test client certificate

pnpm db:deploy          # Apply pending Prisma migrations
pnpm db:seed            # Seed bootstrap admin
pnpm db:generate        # Regenerate Prisma client after schema change
pnpm db:studio          # Open Prisma Studio (DB browser)

pnpm typecheck          # Run tsc --noEmit across all packages
pnpm lint               # ESLint across all packages
```

### Environment

| Service | Default URL |
|---|---|
| Web Dashboard | http://localhost:8123 |
| API | http://localhost:4000 |
| RADIUS Auth | udp://localhost:1812 |
| RADIUS Accounting | udp://localhost:1813 |
| PostgreSQL | localhost:5433 |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome.  
See the [GitHub repository](https://github.com/asiqur-rahman/radiusops) to open an issue or pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Ensure TypeScript passes (`pnpm typecheck`)
4. Commit with a clear message
5. Open a pull request against `main`

**Maintainer:** [Md. Asiqur Rahman Khan](https://github.com/asiqur-rahman)

**Architecture invariant:** All writes to `radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, and `nas` **must** go through `RadiusPolicyService` within a Prisma transaction. Direct Prisma writes to these tables outside the service break the single-source-of-truth guarantee.

---

## 📄 License

MIT © [Md. Asiqur Rahman Khan](https://github.com/asiqur-rahman)

---

<div align="center">

**Nexara** — Enterprise Wi-Fi Access Control, Self-Hosted

*802.1X · PEAP · EAP-TLS · NAC · VLAN Policy · CoA · Telegram Alerts*

*"Every connection, trusted. Every device, controlled. Every policy, enforced."*

Built by **[Md. Asiqur Rahman Khan](https://github.com/asiqur-rahman)**

</div>
