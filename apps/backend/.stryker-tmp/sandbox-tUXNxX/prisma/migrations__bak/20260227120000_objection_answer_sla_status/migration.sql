-- CreateEnum: ObjectionStatus
CREATE TYPE "ObjectionStatus" AS ENUM ('OPEN', 'ANSWERED', 'ESCALATED');

-- Add columns if not present (migration ayrı çalıştırılacak)
ALTER TABLE "objections" ADD COLUMN IF NOT EXISTS "answerText" TEXT;
ALTER TABLE "objections" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);

-- Convert status from TEXT to ObjectionStatus (safe default for unknown values)
ALTER TABLE "objections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "objections" ALTER COLUMN "status" TYPE "ObjectionStatus" USING (
  CASE
    WHEN "status"::text = 'OPEN' THEN 'OPEN'::"ObjectionStatus"
    WHEN "status"::text = 'ANSWERED' THEN 'ANSWERED'::"ObjectionStatus"
    WHEN "status"::text = 'ESCALATED' THEN 'ESCALATED'::"ObjectionStatus"
    ELSE 'OPEN'::"ObjectionStatus"
  END
);
ALTER TABLE "objections" ALTER COLUMN "status" SET DEFAULT 'OPEN'::"ObjectionStatus";
