-- Reklam satın alma kill-switch'i admin_settings tablosuna eklenir.
-- Varsayılan true (açık) — fail-open stratejisi ile mevcut satırlar etkilenmez.
ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "ad_purchases_enabled" BOOLEAN NOT NULL DEFAULT true;
