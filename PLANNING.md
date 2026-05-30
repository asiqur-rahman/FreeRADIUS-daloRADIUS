# Nexara — WPA Enterprise Approval: Status & Next Steps

> **Product:** Nexara — The Intelligent Nexus of Enterprise Wi-Fi Access Control
> **Developed and maintained by:** [Md. Asiqur Rahman Khan](https://github.com/asiqur-rahman)

This file tracks the **FreeRADIUS REST approval workflow** (PEAP device onboarding, Telegram/dashboard decisions, EAP-TLS managed certs). It is separate from the platform delivery phases in [`docs/DEVELOPMENT_PHASES.md`](./docs/DEVELOPMENT_PHASES.md) and [`README.md`](./README.md#phase-status), where Phases 1–6 (foundation through productionization) are already delivered in the repository.

---

## Architecture

```
Device (phone / laptop)
  │  PEAP-MSCHAPv2  or  EAP-TLS  (802.1X)
  ▼
TP-Link AP (or other NAS)
  │  RADIUS UDP 1812
  ▼
FreeRADIUS 3.2.5  (Docker — infra/freeradius/)
  │  rlm_rest HTTP
  │    POST /api/v1/radius/authorize   (inner-tunnel PEAP + check-eap-tls)
  │    POST /api/v1/radius/post-auth     (learn MAC, trigger approval)
  ▼
apps/api  (Fastify + Prisma)
  │
  ├── Postgres   users, devices, approvals, groups, radacct, nas_clients
  └── Telegram   inline-keyboard approval bot (optional)
```

---

## What Is Done (code)

| Area | Status | Where |
|------|--------|--------|
| FreeRADIUS `rlm_rest` + `inner-tunnel` | Done | `infra/freeradius/raddb/mods-available/rest`, `sites-available/inner-tunnel` |
| EAP-TLS policy gate | Done | `infra/freeradius/raddb/sites-available/check-eap-tls` → same `/authorize` hook |
| RADIUS authorize (PEAP + EAP-TLS) | Done | `apps/api/src/routes/radius.ts` |
| RADIUS post-auth (learn device, notify) | Done | `apps/api/src/routes/radius.ts` |
| Shared-secret guard | Done | `X-Radius-Hook-Secret` in `apps/api/src/config.ts` |
| Per-group VLAN reply attributes | Done | `replyFromGroups()` in `radius.ts`; group UI in `apps/web` |
| Device approve/reject (shared service) | Done | `apps/api/src/services/deviceApprovals.ts` |
| Telegram bot | Done | `apps/api/src/lib/telegram.ts` |
| Admin device approvals UI | Done | `apps/web/src/views/LiveDeviceApprovalsView.tsx` |
| Managed client cert bind / issue | Done | `apps/api/src/services/deviceCertificates.ts`, admin cert routes |
| Session disconnect after approval | Done | `disconnectUserSessions()` from `deviceApprovals.ts` (Disconnect-Request, not CoA vlan push) |
| CoA disconnect infrastructure | Done (platform) | `apps/api/src/services/coa.ts`, `sessions.ts` — used elsewhere; approval path uses disconnect |
| Prisma models (`DeviceStatus`, `DeviceApproval`, `certFingerprint`, audit enums) | In schema | `apps/api/prisma/schema.prisma` |
| Custom `apps/radius/` TS server | Removed | Replaced by FreeRADIUS |

---

## What Is Done (Gap Closure — 2026-05-27)

| Feature | Status | Where |
|---------|--------|-------|
| **IP Guard** — DB-backed allowlist, admin panel CRUD | Done | `apps/api/src/lib/ipGuard.ts`, `apps/api/src/routes/admin/radiusAllowlist.ts`, `apps/web/src/views/LiveSettingsView.tsx` |
| `RADIUS_IP_GUARD_ENABLED` config flag | Done | `apps/api/src/config.ts` |
| `RadiusAllowedIp` Prisma model + migration | Done | `apps/api/prisma/schema.prisma`, migration `20260527150000_radius_ip_allowlist` |
| **SSE real-time events** — device.pending / device.decided | Done | `apps/api/src/lib/events.ts`, `apps/api/src/routes/events.ts` |
| SSE emitters in `radius.ts` and `deviceApprovals.ts` | Done | respective files |
| `useSSE` React hook | Done | `apps/web/src/hooks/useSSE.ts` |
| Live auto-refresh in `LiveDeviceApprovalsView` | Done | `apps/web/src/views/LiveDeviceApprovalsView.tsx` |
| **Bell badge** — real pending count, SSE-updated | Done | `apps/web/src/pages/AdminDashboard.jsx` |
| **Mobile responsive sidebar** — hamburger menu, slide-in overlay | Done | `apps/web/src/pages/AdminDashboard.jsx` |
| **PWA** — vite-plugin-pwa, web manifest, theme-color, apple-touch-icon | Done | `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/public/icons/` |
| Title + meta tags updated to Nexara | Done | `apps/web/index.html` |

---

## What Is Not Done Yet

### 1. Database migrations

Two migrations must be applied (in order) before first end-to-end test:

| Migration | Adds |
|-----------|------|
| `20260527090000_device_approval_workflow` | `DeviceStatus`, `user_devices.status`, `device_approvals`, audit enum values; backfills existing rows to `approved` |
| `20260527150000_radius_ip_allowlist` | `radius_allowed_ips` table; `radius_ip_create/delete/update` audit enum values |

```bash
pnpm db:migrate
pnpm db:generate   # already done if you ran this after the first migration
pnpm db:status
```

### 2. Environment & stack (one-time per machine)

| Step | Notes |
|------|--------|
| Copy / fill `.env` | `RADIUS_HOOK_SECRET`, VLAN IDs, DB URL — see `.env.example` |
| Telegram (optional) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` in API env; revoke any leaked token first |
| `pnpm docker:up` | Postgres, FreeRADIUS |
| `pnpm db:migrate` + `pnpm db:seed` | After migration above exists |
| `pnpm lab:check` | Validates env, Docker, migrations, health endpoints, NAS rows, and PEAP prerequisites |
| `pnpm lab:config` | Prints the AP/RADIUS values, VLAN defaults, and seed credentials for the first field test |
| `pnpm lab:device-ca` | Generates a local EAP-TLS device CA and prints the `apps/api/.env` lines needed for local cert issuance |
| `pnpm lab:client-cert -- -CommonName <name>` | Generates a test client cert/PFX for import-based EAP-TLS validation |
| NAS client row | TP-Link AP IP + shared secret in `nas_clients` (admin UI or seed) |
| AP config | RADIUS IP/port/secret; enable 802.1X + PEAP (and EAP-TLS when testing certs) |

`pnpm db:seed` now creates a dedicated PEAP lab user by default:

- `wifi-test` / `wifi12345!`

It can also seed a NAS row if you set `SEED_LAB_NAS_IP` and optionally `SEED_LAB_NAS_SECRET`.

### 3. Field validation (proves it in the building)

These are **deployment acceptance** items, not missing application code:

- [ ] **PEAP onboarding** — unknown phone connects → quarantine VLAN → Telegram or dashboard notification → approve → disconnect/reconnect → normal VLAN from group policy
- [ ] **CoA disconnect on TP-Link** — confirm the AP ACKs Disconnect-Request within your SLO (~2s); see [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [ ] **EAP-TLS** — trusted client CA on AP/supplicant, cert bound or issued in admin UI, successful auth via `check-eap-tls`, correct VLAN
- [ ] **Accounting** — `radacct` rows and live sessions view update after auth

### 4. Optional enhancements (not required to call the feature “shipped”)

| Item | Why optional |
|------|----------------|
| **CoA-Request for VLAN change without full disconnect** | Today, approval triggers Disconnect-Request; client re-authenticates for new VLAN. True RFC 3576 CoA-Request for dynamic VLAN is not wired in the approval path. |
| **Production TLS for RADIUS** | Bootstrap certs in Docker; replace for production per operations guide. |

---

## Suggested order of work (from here)

```
1.  pnpm db:migrate && pnpm db:generate              (schema and client aligned)
2.  pnpm docker:up && pnpm db:seed                   (stack + test user + NAS)
3.  pnpm lab:check                                   (catch blockers before AP work)
4.  pnpm lab:config -- -ServerIp <lan-ip>            (print exact router/test values)
5.  Follow docs/FIELD_VALIDATION.md for PEAP         (closes onboarding loop)
6.  pnpm lab:device-ca                               (bootstraps local EAP-TLS CA)
7.  pnpm lab:client-cert -- -CommonName <name>       (creates a test cert/PFX)
8.  Import/bind client cert → EAP-TLS on same AP     (closes Phase 5 field gate)
9.  Log TP-Link Disconnect-ACK behavior              (closes CoA acceptance)
```

---

## File map (approval + EAP-TLS + gap closure)

```
apps/api/
  prisma/schema.prisma              DeviceStatus, DeviceApproval, RadiusAllowedIp
  prisma/migrations/
    20260527090000_device_approval_workflow/
    20260527150000_radius_ip_allowlist/
  src/config.ts                     RADIUS_IP_GUARD_ENABLED + VLAN IDs
  src/routes/radius.ts              /authorize (PEAP + EAP-TLS), /post-auth + SSE emit
  src/routes/events.ts              GET /events  — SSE stream (JWT via QS token=)
  src/routes/admin/radiusAllowlist.ts  CRUD for radius_allowed_ips
  src/services/deviceApprovals.ts   approve/reject + disconnect + SSE emit
  src/services/deviceCertificates.ts bind / issue / clear certs
  src/lib/events.ts                 in-process EventEmitter (platform event bus)
  src/lib/ipGuard.ts                CIDR match + 30 s in-memory cache
  src/lib/telegram.ts               polling + inline keyboard
  src/lib/clientCertificates.ts     PEM parse + fingerprint for EAP-TLS identity

apps/web/
  src/hooks/useSSE.ts               EventSource hook with auto-reconnect
  src/views/LiveDeviceApprovalsView.tsx  live auto-refresh via SSE
  src/views/LiveSettingsView.tsx    EAP cert inventory + IP allowlist CRUD
  src/pages/AdminDashboard.jsx      responsive sidebar + bell badge (real count)
  vite.config.ts                    vite-plugin-pwa manifest
  index.html                        PWA meta tags, theme-color
  public/icons/                     SVG source icon (generate PNG for production)

infra/freeradius/raddb/
  mods-available/rest
  sites-available/inner-tunnel
  sites-available/check-eap-tls
```

---

## Related docs

- Platform phases (complete in repo): [`docs/DEVELOPMENT_PHASES.md`](./docs/DEVELOPMENT_PHASES.md)
- Deploy, CoA SLO, backups: [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- Quick start: [`README.md`](./README.md)
