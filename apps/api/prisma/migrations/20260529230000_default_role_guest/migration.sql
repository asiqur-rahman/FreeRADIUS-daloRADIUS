-- Change the default role for new users from 'user' to 'guest'.
-- This aligns the database default with the API-layer default (body.role ?? "guest").
-- Existing user rows are unaffected.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'guest';
