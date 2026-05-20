-- CreateTable: objections (20260227120000 bu tabloyu ALTER eder)
CREATE TABLE IF NOT EXISTS "objections" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objections_pkey" PRIMARY KEY ("id")
);

-- FKs for objections
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objections_attemptId_fkey') THEN
    ALTER TABLE "objections" ADD CONSTRAINT "objections_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objections_questionId_fkey') THEN
    ALTER TABLE "objections" ADD CONSTRAINT "objections_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objections_reporterId_fkey') THEN
    ALTER TABLE "objections" ADD CONSTRAINT "objections_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: admin_settings (SeedService bunu kullanır)
CREATE TABLE IF NOT EXISTS "admin_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "commissionPercent" INTEGER NOT NULL DEFAULT 20,
    "vatPercent" INTEGER NOT NULL DEFAULT 18,
    "purchasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);
