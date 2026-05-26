# Enterprise WiFi RADIUS Management Platform

Production-grade 802.1X / PEAP / EAP-TLS management platform with admin and self-service dashboards.

See [`RADIUS_Platform_Architecture.docx`](./RADIUS_Platform_Architecture.docx) for the full architecture specification.

## Stack

| Tier | Tech |
|---|---|
| Web | React 18 + Vite + Tailwind |
| API | Node 20 + TypeScript + Fastify 5 + Prisma 5 + Zod |
| Auth | FreeRADIUS 3.2 (PEAP-MSCHAPv2, EAP-TLS) |
| Data | PostgreSQL 16, Redis 7 |
| Dev | Docker Compose, pnpm workspaces |

## Repo layout

```
.
├── apps/
│   ├── api/                 Fastify + Prisma backend
│   └── web/                 React + Vite frontend
├── packages/
│   └── shared/              Shared types between api and web
├── infra/
│   ├── postgres/init/       FreeRADIUS schema + DB role bootstrap
│   └── freeradius/raddb/    FreeRADIUS 3.x config
├── docker-compose.yml
└── .env.example
```

## Quick start

```bash
# 1. Install deps
pnpm install

# 2. Copy env
cp .env.example .env

# 3. Bring up Postgres + Redis + FreeRADIUS
pnpm docker:up

# 4. Run Prisma migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Start API + web in dev mode
pnpm dev
```

Open <http://localhost:5173>.

Default seeded admin: `admin` / `admin1234!` - change immediately. In deployments, set `SEED_ADMIN_PASSWORD` before the first seed.

## Phase status

**Phase 1 (Foundation)** — complete & verified.

- [x] Monorepo + workspace; typecheck clean across `apps/api`, `apps/web`, `packages/shared`
- [x] Docker Compose dev stack (Postgres, Redis, FreeRADIUS via Dockerfile overlay)
- [x] Prisma schema, seed bootstrap admin
- [x] Fastify API with JWT auth + RBAC, refresh-cookie rotation
- [x] RadiusPolicyService — single writer of radcheck/radreply/radgroup\*/radusergroup/nas
- [x] Admin user CRUD with RADIUS sync, group attribute write-through
- [x] React login page + AdminDashboard / ClientPortal wired with real auth + logout

**Phase 2 (Networking)** — complete.

- [x] `EapCertificate` model + admin routes (add via PEM, activate, delete; severity buckets 60/30/7)
- [x] `Site` admin routes
- [x] `NasClient` admin routes — add/edit/delete + atomic shared-secret rotation
- [x] RadiusPolicyService.`syncNasToRadius` / `purgeNasFromRadius`
- [x] Live NAS management view in the admin dashboard (replaces mock)

**Phase 3 (Devices & Operations)** - implemented.

- [x] Self-service device binding APIs and portal UX (add, rename, mark primary, remove with password verification)
- [x] Normalized MAC comparison in FreeRADIUS and removal-triggered session disconnect attempts
- [x] `radacct`-backed admin session view with active/history search
- [x] Signed RADIUS Disconnect-Request dispatch with NAS ACK/NAK/timeout auditing
- [x] Configurable auto-disconnect policies for credential and policy transitions

**Phase 4 (Observability)** - implemented.

- [x] Live admin overview derived from accounting and post-auth records
- [x] Certificate-expiry, NAS-silence, and reject-spike operational alerts
- [x] Audit-log and combined web/RADIUS authentication event views

**Phase 5 (Hardening)** - implemented.

- [x] Encrypted TOTP MFA enrollment, activation, disablement, and login verification
- [x] Login failure lockout and refresh-token revocation on logout/password change
- [x] Origin enforcement on state-changing requests and optional HIBP password screening

**Phase 6 (Productionization)** - implemented in repository.

- [x] Versioned Prisma initialization migration, API/web production containers, Compose production overlay
- [x] Backup/restore tooling, readiness verification, operations runbook, and service objectives

Deployment acceptance remains environment-specific: validate CoA acknowledgement time against the production NAS/WLC, install and inventory the production EAP certificate, and conduct a database restore drill. See [`docs/OPERATIONS.md`](./docs/OPERATIONS.md).
