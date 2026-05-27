-- Ensures Prisma's migration tracking table exists before migrate deploy runs.
-- Without this, Prisma throws P3005 when it finds the FreeRADIUS tables
-- (radcheck, radreply, etc.) that were created by the Postgres init scripts
-- before Prisma ever ran.  An empty _prisma_migrations table signals to Prisma
-- that the database is Prisma-managed and it will apply all pending migrations.
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id                    VARCHAR(36)              NOT NULL,
  checksum              VARCHAR(64)              NOT NULL,
  finished_at           TIMESTAMP WITH TIME ZONE,
  migration_name        VARCHAR(255)             NOT NULL,
  logs                  TEXT,
  rolled_back_at        TIMESTAMP WITH TIME ZONE,
  started_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  applied_steps_count   INTEGER                  NOT NULL DEFAULT 0,
  CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id)
);
