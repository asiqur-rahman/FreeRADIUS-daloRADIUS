#!/usr/bin/env bash
# Grant table-level permissions on the FreeRADIUS schema to both roles.
# RADIUS tables: full DML for both (app writes via RadiusPolicyService,
# FreeRADIUS writes radacct/radpostauth and reads the rest).
set -euo pipefail

: "${APP_DB_USER:=app_user}"
: "${RADIUS_DB_USER:=radius_user}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  GRANT SELECT, INSERT, UPDATE, DELETE ON
    radcheck, radreply, radgroupcheck, radgroupreply, radusergroup,
    radacct, radpostauth, nas
    TO ${APP_DB_USER}, ${RADIUS_DB_USER};

  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO ${APP_DB_USER}, ${RADIUS_DB_USER};

  -- Default privileges so Prisma-created tables are automatically
  -- visible to radius_user where needed (FreeRADIUS reads user_devices
  -- for MAC binding, etc.).
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO ${RADIUS_DB_USER};
EOSQL

echo "Table grants applied."
