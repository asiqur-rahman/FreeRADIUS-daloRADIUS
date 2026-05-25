#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  Bootstrap two DB roles inside the platform database.
#
#  app_user    → owned by the Node API. Owns the app schema (Prisma
#                migrations write here). Has full DML on the RADIUS
#                tables it manages via RadiusPolicyService.
#
#  radius_user → used by FreeRADIUS. Read-only on the few app columns
#                FreeRADIUS needs, full DML on radacct + radpostauth.
#
#  Lock down further in production (separate DBs, network, mTLS).
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${APP_DB_USER:=app_user}"
: "${APP_DB_PASSWORD:=app_user_dev_password}"
: "${RADIUS_DB_USER:=radius_user}"
: "${RADIUS_DB_PASSWORD:=radius_user_dev_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
      CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RADIUS_DB_USER}') THEN
      CREATE ROLE ${RADIUS_DB_USER} LOGIN PASSWORD '${RADIUS_DB_PASSWORD}';
    END IF;
  END
  \$\$;

  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${RADIUS_DB_USER};
  GRANT USAGE, CREATE ON SCHEMA public TO ${APP_DB_USER};
  GRANT USAGE ON SCHEMA public TO ${RADIUS_DB_USER};

  ALTER DEFAULT PRIVILEGES FOR ROLE ${APP_DB_USER} IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RADIUS_DB_USER};
EOSQL

echo "Roles ${APP_DB_USER} and ${RADIUS_DB_USER} provisioned."
