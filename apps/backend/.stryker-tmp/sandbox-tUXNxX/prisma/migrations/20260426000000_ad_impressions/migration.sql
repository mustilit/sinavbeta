-- Migration: ad_impressions tablosu + AdPurchase genişletme
-- Reklam gösterim takibi ve hedef türü (TEST | EDUCATOR) desteği eklenir.

-- 1. AdTargetType enum'u oluştur
CREATE TYPE "AdTargetType" AS ENUM ('TEST', 'EDUCATOR');

-- 2. ad_purchases tablosuna yeni sütunlar ekle
--    targetType: TEST (varsayılan) veya EDUCATOR
ALTER TABLE "ad_purchases"
  ADD COLUMN "target_type" "AdTargetType" NOT NULL DEFAULT 'TEST',
  ADD COLUMN "impressions_delivered" INTEGER NOT NULL DEFAULT 0;

-- 3. testId artık nullable (EDUCATOR türünde test yoktur)
ALTER TABLE "ad_purchases"
  ALTER COLUMN "testId" DROP NOT NULL;

-- 4. ad_impressions tablosu: her ana sayfa yüklemesindeki gösterimi kaydeder
CREATE TABLE "ad_impressions" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "purchase_id"    TEXT        NOT NULL,
  "educator_id"    TEXT        NOT NULL,
  "test_id"        TEXT,
  "viewer_user_id" TEXT,
  "created_at"     TIMESTAMP   NOT NULL DEFAULT NOW(),

  CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ad_impressions_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "ad_purchases"("id") ON DELETE CASCADE,
  CONSTRAINT "ad_impressions_educator_id_fkey"
    FOREIGN KEY ("educator_id") REFERENCES "users"("id"),
  CONSTRAINT "ad_impressions_viewer_user_id_fkey"
    FOREIGN KEY ("viewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 5. İndeksler: purchase, educator ve tarih bazlı sorgular için
CREATE INDEX "ad_impressions_purchase_id_idx" ON "ad_impressions"("purchase_id");
CREATE INDEX "ad_impressions_educator_id_idx" ON "ad_impressions"("educator_id");
CREATE INDEX "ad_impressions_created_at_idx" ON "ad_impressions"("created_at");
