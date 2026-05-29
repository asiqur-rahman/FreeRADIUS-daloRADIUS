-- Remove the 'guest' value from the UserRole enum.
--
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate the
-- enum with only the values we want to keep (admin, user).
--
-- 1. Migrate any existing 'guest' users to 'user' so no rows are orphaned.
UPDATE "users" SET "role" = 'user' WHERE "role" = 'guest';

-- 2. Set the column default to 'user' before we swap out the type.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

-- 3. Rename the old enum out of the way.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

-- 4. Create the new, trimmed enum.
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- 5. Migrate the column to the new enum type.
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole");

-- 6. Drop the now-unused old enum.
DROP TYPE "UserRole_old";
