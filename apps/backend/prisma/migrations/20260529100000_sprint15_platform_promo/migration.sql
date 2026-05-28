-- Sprint 15 — Platform Admin Promo Code
--
-- Yeni iki tablo:
--   platform_promo_codes  : admin tarafından oluşturulan promo kodu (LIVE_SESSION / AD_PACKAGE)
--   platform_promo_code_usages : her kullanım kaydı + audit
--
-- LiveSession ve AdPurchase tablolarına 3 snapshot kolonu eklenir:
--   paidCents (gerçek ödenen tutar), platformPromoCodeId, platformPromoDiscountCents

-- 1) Enum
CREATE TYPE "PlatformPromoScope" AS ENUM ('LIVE_SESSION', 'AD_PACKAGE');

-- 2) PlatformPromoCode tablosu
CREATE TABLE "platform_promo_codes" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "code"        TEXT NOT NULL,
  "description" TEXT,
  "percentOff"  INTEGER NOT NULL,
  "scopes"      "PlatformPromoScope"[] NOT NULL DEFAULT ARRAY[]::"PlatformPromoScope"[],
  "maxUses"     INTEGER,
  "usedCount"   INTEGER NOT NULL DEFAULT 0,
  "validFrom"   TIMESTAMP(3),
  "validUntil"  TIMESTAMP(3),
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_promo_codes_code_key" ON "platform_promo_codes" ("code");
CREATE INDEX "platform_promo_codes_code_idx" ON "platform_promo_codes" ("code");
CREATE INDEX "platform_promo_codes_isActive_validUntil_idx" ON "platform_promo_codes" ("isActive", "validUntil");

-- 3) PlatformPromoCodeUsage tablosu
CREATE TABLE "platform_promo_code_usages" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "promoCodeId"   UUID NOT NULL,
  "educatorId"    TEXT NOT NULL,
  "purchaseType"  TEXT NOT NULL,
  "purchaseId"    TEXT NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "usedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_promo_code_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_promo_code_usages_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "platform_promo_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "platform_promo_code_usages_promoCodeId_purchaseId_key"
  ON "platform_promo_code_usages" ("promoCodeId", "purchaseId");
CREATE INDEX "platform_promo_code_usages_educatorId_idx" ON "platform_promo_code_usages" ("educatorId");
CREATE INDEX "platform_promo_code_usages_purchaseId_idx" ON "platform_promo_code_usages" ("purchaseId");

-- 4) LiveSession + AdPurchase snapshot kolonları
ALTER TABLE "live_sessions"
  ADD COLUMN IF NOT EXISTS "paidCents"                    INTEGER,
  ADD COLUMN IF NOT EXISTS "platformPromoCodeId"          UUID,
  ADD COLUMN IF NOT EXISTS "platformPromoDiscountCents"   INTEGER;

ALTER TABLE "ad_purchases"
  ADD COLUMN IF NOT EXISTS "paidCents"                    INTEGER,
  ADD COLUMN IF NOT EXISTS "platformPromoCodeId"          UUID,
  ADD COLUMN IF NOT EXISTS "platformPromoDiscountCents"   INTEGER;
