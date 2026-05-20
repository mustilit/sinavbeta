-- Migration: add_2fa_system_setting
-- Admin panelinden sistem geneli 2FA aç/kapat kontrolü.
-- Default false — mevcut kayıtlar etkilenmez.

ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "twoFactorSystemEnabled" BOOLEAN NOT NULL DEFAULT false;
