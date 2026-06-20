-- Yazılı paket minimum fiyatı (admin ayarı)
ALTER TABLE "admin_settings" ADD COLUMN "minWrittenPriceCents" INTEGER NOT NULL DEFAULT 0;
