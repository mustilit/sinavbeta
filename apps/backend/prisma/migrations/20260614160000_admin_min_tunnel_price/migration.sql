-- Minimum tünel fiyatı (admin panelinden ayarlanır)
ALTER TABLE "admin_settings" ADD COLUMN "minTunnelPriceCents" INTEGER NOT NULL DEFAULT 0;
