-- Migration: add_2fa_fields
-- 2FA (TOTP) alanları users tablosuna eklendi.
-- Paketler: otplib ^13.4.0, qrcode ^1.5.4 (package.json'da mevcut).
-- twoFactorSecret: AES-GCM şifreli tutulur, asla plain text saklanmaz.
-- twoFactorRecovery: bcrypt'lenmiş tek kullanımlık kurtarma kodları dizisi.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled"   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorSecret"     TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorRecovery"   TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "twoFactorEnabledAt"  TIMESTAMP(3);

-- Koşullu sorgu performansı için (twoFactorEnabled=true kullanıcıları hızlı bul)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_two_factor_enabled_idx"
  ON "users" ("twoFactorEnabled");
