-- FR-Y-09, FR-E-07: Ad packages + educator ad purchases
ALTER TABLE "ad_packages" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ad_packages" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ad_purchases" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "adPackageId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "impressionsRemaining" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_purchases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ad_purchases_educatorId_idx" ON "ad_purchases"("educatorId");
CREATE INDEX IF NOT EXISTS "ad_purchases_testId_idx" ON "ad_purchases"("testId");
CREATE INDEX IF NOT EXISTS "ad_purchases_validUntil_idx" ON "ad_purchases"("validUntil");

ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_adPackageId_fkey" FOREIGN KEY ("adPackageId") REFERENCES "ad_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
