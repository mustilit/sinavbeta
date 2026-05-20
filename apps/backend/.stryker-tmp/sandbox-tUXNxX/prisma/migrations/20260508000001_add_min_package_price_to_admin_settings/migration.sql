-- Minimum paket fiyatı (kuruş cinsinden). Varsayılan 100 = 1 ₺
ALTER TABLE "admin_settings" ADD COLUMN IF NOT EXISTS "minPackagePriceCents" INTEGER NOT NULL DEFAULT 100;
