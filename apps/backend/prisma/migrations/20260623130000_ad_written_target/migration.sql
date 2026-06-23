-- Reklam hedefine YAZILI paket eklendi (AdTargetType.WRITTEN) + scalar writtenPackageId.
ALTER TYPE "AdTargetType" ADD VALUE IF NOT EXISTS 'WRITTEN';

ALTER TABLE "ad_purchases" ADD COLUMN "writtenPackageId" TEXT;
CREATE INDEX "ad_purchases_writtenPackageId_idx" ON "ad_purchases" ("writtenPackageId");
