-- Remove the 'guest' value from the UserRole enum.
--
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate the
-- enum with only the values we want to keep (admin, user).
--
-- 1. Migrate any existing 'guest' users to 'user' so no rows are orphaned.
UPDATE "users" SET "role" = 'user' WHERE "role" = 'guest';

-- 2. Drop the column default BEFORE renaming the type.
--    If we set (or leave) a default that references "UserRole" and then rename
--    the type to "UserRole_old", the default expression becomes
--    'user'::"UserRole_old" — and PostgreSQL refuses to cast that to the new
--    "UserRole" type when we ALTER COLUMN TYPE.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- 3. Rename the old enum out of the way.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

-- 4. Create the new, trimmed enum.
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- 5. Migrate the column to the new enum type.
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole");

-- 6. Restore the column default now that it references the correct new type.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

-- 7. Drop the now-unused old enum.
DROP TYPE "UserRole_old";
