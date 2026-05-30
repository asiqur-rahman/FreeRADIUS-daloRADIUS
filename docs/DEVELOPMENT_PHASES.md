# Delivery Phases

## Phase 1: Foundation

Delivered: pnpm monorepo, Fastify/JWT/RBAC API, Prisma data model, RADIUS policy sync, login and role-based dashboards.

## Phase 2: Networking

Delivered: NAS and site management, secret rotation, group policy write-through, EAP certificate inventory, live NAS administration.

## Phase 3: Devices and Operations

Delivered: self-service MAC binding, normalized FreeRADIUS checks, `radacct` session browsing, signed CoA disconnect requests, user accounting overview, configurable disconnect triggers.

Deployment validation: verify NAS/WLC Disconnect-ACK behavior and the two-second acknowledgement objective on real network equipment.

## Phase 4: Observability

Delivered: live operational overview, `radpostauth` trends and rejects, certificate and NAS silence alerts, combined web/RADIUS authentication events, live audit display.

## Phase 5: Hardening

Delivered: encrypted TOTP MFA enrollment and login verification, login lockout, refresh-token revocation on logout/password rotation, origin checks for state changes, optional HIBP password screening.

## Phase 6: Productionization

Delivered: versioned initial Prisma migration, production API/web containers, compose overlay, backup/restore scripts, health probes, deployment runbook, and service objectives.
