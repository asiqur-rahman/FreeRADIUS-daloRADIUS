# WPA Enterprise Approval System — Project Planning

## Current Status

### Architecture (decided)

```
Device (phone / laptop)
  │  PEAP-MSCHAPv2  (802.1X)
  ▼
TP-Link AP
  │  RADIUS UDP 1812
  ▼
FreeRADIUS 3.2.5  (Docker)
  │  rlm_rest HTTP  →  POST /api/v1/radius/authorize
  │                    POST /api/v1/radius/post-auth
  ▼
apps/api  (Fastify + Prisma)
  │
  ├── Postgres   users, devices, approvals, VLAN policies
  ├── Redis      sessions, rate limits
  └── Telegram   inline-keyboard approval bot
```

---

## What Is Already Built

### Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| FreeRADIUS Docker image | ✅ Config written | `infra/freeradius/` — needs `docker compose build` |
| `rlm_rest` module | ✅ Written | `infra/freeradius/raddb/mods-available/rest` |
| `inner-tunnel` virtual server | ✅ Rewritten | Uses REST hook instead of direct SQL for auth |
| `docker-compose.yml` | ✅ Updated | FreeRADIUS no longer behind a profile; `HOOK_HOST/PORT/SECRET` wired |
| Postgres + Redis | ✅ Already running | Via `docker compose up -d` |

### Database (Prisma)

| Model / Change | Status | Notes |
|----------------|--------|-------|
| `DeviceStatus` enum (`pending/approved/rejected`) | ✅ Schema written | Migration not yet run |
| `UserDevice.status` field | ✅ Schema written | Default: `pending` |
| `DeviceApproval` model | ✅ Schema written | Audit trail per decision |
| `User.approvalDecisions` relation | ✅ Schema written | Links admin to decisions |
| `AuditAction.device_approve/reject` | ✅ Schema written | For future audit log entries |
| **Prisma migration** | ❌ Not run yet | Run `pnpm prisma:migrate` |

### API (`apps/api`)

| Feature | Status | Notes |
|---------|--------|-------|
| `POST /api/v1/radius/authorize` | ✅ Written | Returns `NT-Password` + VLAN assignment |
| `POST /api/v1/radius/post-auth` | ✅ Written | Registers new devices, fires Telegram |
| Shared-secret guard (`X-Radius-Hook-Secret`) | ✅ Written | Rejects requests without the header |
| `RADIUS_HOOK_SECRET` config | ✅ Written | In `config.ts` + `.env` |
| `QUARANTINE_VLAN_ID` / `NORMAL_VLAN_ID` config | ✅ Written | Defaults: 99 / 10 |
| Telegram bot polling | ✅ Written | `src/lib/telegram.ts` — starts on `pnpm dev` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_ID` config | ✅ Written | Commented out in `.env` — needs real values |

### Removed

| What | Why |
|------|-----|
| `apps/radius/` | Entire custom TypeScript RADIUS server deleted — replaced by FreeRADIUS |

---

## Recent Update

Since this planning file was first written, the codebase has moved forward in two important ways:

- Telegram approval and rejection now go through a shared device-decision service that updates the device status, writes audit logs, and disconnects active device sessions so the AP can reauthenticate with the new policy.
- The Phase 3 backend API is now in place with `GET /api/v1/admin/devices`, `PATCH /api/v1/admin/devices/:id`, `GET /api/v1/admin/approvals`, and `GET /api/v1/admin/users/:id/devices`.
- The Phase 3 admin UI now has a live Device Approvals workspace in `apps/web`, with a pending queue, full device inventory, approval history, and per-user device inspection backed by those APIs.
- Phase 4 per-group VLAN policy is now live: approved devices inherit group reply attributes from the REST authorize hook, with VLAN editing exposed in the Groups UI.

The remaining work for Phase 2 is now mostly AP verification: confirm how the TP-Link firmware behaves with Disconnect/CoA and decide whether Disconnect-Request is enough or whether a true CoA-Request variant is needed.

## What Is NOT Done Yet

### Immediate (must do before first test)

- [ ] **Revoke the leaked Telegram bot token**
  - Go to Telegram → @BotFather → `/mybots` → select bot → API Token → Revoke
  - Generate a new token, put it in `apps/api/.env`

- [ ] **Get your Telegram admin chat ID**
  - Message `@userinfobot` on Telegram — it replies with your chat ID
  - Add to `apps/api/.env` as `TELEGRAM_ADMIN_CHAT_ID`

- [ ] **Run Prisma migration**
  ```bash
  cd apps/api
  pnpm prisma:migrate        # name: "device-approval-workflow"
  pnpm prisma:generate
  ```

- [ ] **Build and start FreeRADIUS**
  ```bash
  docker compose build freeradius
  docker compose up -d
  ```

- [ ] **Add AP as a NAS client**
  - Insert a row into `nas_clients` table for your TP-Link AP IP
  - The AP's IP + shared secret must match what's configured on the AP

- [ ] **Seed a test user** with `ntHash`
  - The `authorize` endpoint reads `user_secrets.ntHash` (16-byte MD4 hex)
  - Make sure at least one user has this populated
  - Run `pnpm db:seed` or insert manually via Prisma Studio (`pnpm prisma:studio`)

- [ ] **Configure PEAP on your TP-Link AP**
  - RADIUS server IP: your machine's IP (or Docker host IP)
  - RADIUS port: 1812
  - Shared secret: must match the `nas_clients` row

---

### Phase 2 — CoA (Change of Authorization)

When an admin approves a device via Telegram, the device is still on the quarantine VLAN.
Currently the user must **reconnect** to get the normal VLAN.

To fix this:
- After approval, send a **CoA-Request** (RFC 3576) to the AP
- The AP re-runs authentication and assigns the normal VLAN
- The device switches VLANs without disconnecting

**What needs to be built:**
- [ ] Extend `src/lib/telegram.ts` `handleCallback()` — after approving, look up the active session from `radacct` (session ID + NAS IP) and call the existing `sendCoARequest` service
- [ ] Add `radacct` session lookup to `apps/api/src/services/sessions.ts`
- [ ] Verify TP-Link AP supports CoA (RFC 3576) — some firmware requires enabling it separately

---

### Phase 3 — Admin Dashboard (Web UI)

The `apps/web` React app needs new pages:

| Page | What it shows |
|------|---------------|
| `/devices` | All devices — pending / approved / rejected — with Approve/Reject buttons |
| `/devices/pending` | Just the pending queue, sorted by `requestedAt` |
| `/audit` | `DeviceApproval` history — who decided what and when |
| `/users/:id/devices` | Devices for a specific user |

**API endpoints needed in `apps/api`:**
- [ ] `GET /api/v1/admin/devices` — list devices with filters (`status`, `userId`, `search`)
- [ ] `PATCH /api/v1/admin/devices/:id` — approve or reject (updates `UserDevice.status`, creates `DeviceApproval`)
- [ ] `GET /api/v1/admin/approvals` — approval audit log

---

### Phase 4 — VLAN Policy per Group

Right now every approved user gets the same `NORMAL_VLAN_ID`.
For per-department or per-role VLANs:

- [ ] Add `vlanId` to `Group` (or use the existing `GroupAttribute` with `Tunnel-Private-Group-ID`)
- [ ] Update `/authorize` to check the user's group membership and return the correct VLAN
- [ ] UI: VLAN assignment on the Group edit page

---

### Phase 5 — EAP-TLS (Managed Devices)

For company-owned laptops / MDM-enrolled devices:

- [ ] Enable `EAP-TLS` in FreeRADIUS `eap` module config
- [ ] Add client certificate provisioning workflow (admin generates + downloads cert)
- [ ] Update `UserDevice` with `certFingerprint` (field already exists in schema)
- [ ] Update `/authorize` to return `EAP-TLS` control attributes when a client cert is presented

---

### Phase 6 — Production Hardening

Before deploying to a real office:

- [ ] Replace FreeRADIUS bootstrap self-signed cert with a proper CA cert
- [ ] Set `RADIUS_HOOK_SECRET` to a strong random value (≥ 32 chars) in production `.env`
- [ ] Set `HOOK_SECRET` in `docker-compose.production.yml`
- [ ] Enable HTTPS on `apps/api` (or put it behind nginx/Caddy)
- [ ] Use per-NAS secrets (≥ 32 chars) for every AP
- [ ] Set up log rotation for `radacct` / `radpostauth` tables
- [ ] Configure Redis with a password
- [ ] Add Postgres backups

---

## Next Action (ordered)

```
1.  Revoke leaked Telegram token  →  get new token + chat ID
2.  pnpm prisma:migrate            →  apply schema changes
3.  docker compose build && up     →  FreeRADIUS running
4.  Insert NAS row for TP-Link AP  →  AP can send to RADIUS
5.  Seed one test user with ntHash →  authorize endpoint has data
6.  Connect test phone             →  see Telegram notification
7.  Tap Approve                    →  device status → approved
8.  Reconnect phone                →  gets NORMAL_VLAN (10)
```

---

## File Map

```
D:/RnD/Freeradius/
├── apps/
│   ├── api/                         ← Fastify + Prisma backend
│   │   ├── prisma/schema.prisma     ← DeviceApproval, DeviceStatus added
│   │   ├── src/
│   │   │   ├── config.ts            ← RADIUS_HOOK_SECRET, VLAN IDs, Telegram
│   │   │   ├── index.ts             ← starts Telegram polling on boot
│   │   │   ├── lib/telegram.ts      ← bot + approval flow  ← NEW
│   │   │   ├── routes/radius.ts     ← /authorize + /post-auth  ← NEW
│   │   │   └── server.ts            ← registers radius routes
│   │   └── .env                     ← add TELEGRAM_* values here
│   │
│   └── web/                         ← React admin UI (dashboard pending)
│
├── infra/
│   └── freeradius/
│       ├── Dockerfile               ← copies rest module + inner-tunnel
│       └── raddb/
│           ├── clients.conf         ← add AP entry here (or via DB)
│           ├── mods-available/
│           │   ├── sql              ← existing (accounting)
│           │   └── rest             ← NEW (user auth + post-auth)
│           └── sites-available/
│               ├── default          ← outer PEAP server (unchanged)
│               └── inner-tunnel     ← REWRITTEN (REST-based auth)
│
├── docker-compose.yml               ← FreeRADIUS always on, HOOK_* env added
└── PLANNING.md                      ← this file
```
