-- CreateEnum: UserStatus for users.status (was TEXT)
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_EDUCATOR_APPROVAL');

-- AlterTable: users.status TEXT -> UserStatus with safe default for unknown values
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "status" TYPE "UserStatus" USING (
  CASE
    WHEN "status"::text = 'ACTIVE' THEN 'ACTIVE'::"UserStatus"
    WHEN "status"::text = 'SUSPENDED' THEN 'SUSPENDED'::"UserStatus"
    WHEN "status"::text = 'PENDING_EDUCATOR_APPROVAL' THEN 'PENDING_EDUCATOR_APPROVAL'::"UserStatus"
    ELSE 'ACTIVE'::"UserStatus"
  END
);
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"UserStatus";
