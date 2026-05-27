# RadiusOps Operations Guide

## Deployment

1. Populate `.env` with production secrets, public `CORS_ORIGINS`, `COOKIE_SECURE=true`, and a unique `MFA_ENCRYPTION_KEY`. Keep `REQUIRE_ADMIN_MFA=false` only for initial bootstrap.
2. Start infrastructure: `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d postgres freeradius`.
3. Install dependencies and apply application migrations: `pnpm install --frozen-lockfile` then `pnpm db:deploy`.
4. Seed only for a new installation: set `SEED_ADMIN_PASSWORD` to a strong temporary value, then run `pnpm db:seed`.
5. Start the API and web containers: `pnpm docker:prod:up`.
6. Sign in as the bootstrap administrator, enroll authenticator MFA, set `REQUIRE_ADMIN_MFA=true`, restart the API, and confirm administrator sign-in requires a code.
7. Confirm `/health/ready`, portal login, a test RADIUS authentication, accounting arrival, and CoA against a test session.

For lab acceptance against a real AP and supplicant, follow [`FIELD_VALIDATION.md`](./FIELD_VALIDATION.md).

Production FreeRADIUS uses the upstream EAP module with this repository's SQL and site overlays. Install the deployment's EAP server certificate in FreeRADIUS and record the active PEM certificate through the admin certificate inventory so expiry alerts operate.

## Backups

Run `powershell -File ops/backup-postgres.ps1` on a schedule and move resulting `.dump` files to encrypted off-host storage. Backups contain password hashes, RADIUS credential material, NAS secrets, MFA secrets, and audit history.

Restore drill:

1. Start an isolated stack with empty volumes.
2. Run `powershell -File ops/restore-postgres.ps1 -BackupPath <dump>`.
3. Start API/web and verify admin login, active certificate inventory, user/group policy, and session reporting.
4. Record restore duration and any corrective action.

## Monitoring

- Probe `GET /health/live` for process liveness and `GET /health/ready` for database readiness.
- Alert on active EAP certificate expiry, NAS accounting silence, reject spikes, API readiness failures, PostgreSQL storage pressure, and backup freshness.
- Forward API, FreeRADIUS, and PostgreSQL logs to retained centralized storage.

## Service Objectives

| Signal | Objective | Alert Trigger |
|---|---:|---:|
| Portal/API availability | 99.9% monthly | readiness failure for 5 minutes |
| Admin live sessions load | p95 < 1 second | p95 > 1 second for 15 minutes |
| CoA disconnect acknowledgement | p95 < 2 seconds | timeout/error rate > 5% in 15 minutes |
| RADIUS authentication availability | 99.9% monthly | accept traffic unexpectedly stops or rejects spike |
| Restore point objective | <= 24 hours | no valid off-host backup in 24 hours |
| Restore time objective | <= 2 hours | restore drill exceeds 2 hours |

## Security Operations

- Rotate JWT, cookie, MFA encryption, database, and NAS secrets through a planned maintenance event.
- Keep `REQUIRE_ADMIN_MFA=true` after bootstrap and turn on `HIBP_CHECK_ENABLED=true` where the API can reach the HIBP range endpoint.
- Keep `COA_DISCONNECT_ON_PASSWORD_CHANGE` and `COA_DISCONNECT_ON_USER_POLICY_CHANGE` enabled; enable group-policy disconnect only after testing expected user impact.
- Treat audit logs and authentication events as security records and export them to immutable retention.
