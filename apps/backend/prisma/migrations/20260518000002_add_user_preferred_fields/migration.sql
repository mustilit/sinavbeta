-- Migration: add_user_preferred_fields
-- preferredCurrency ve preferredLocale schema'da tanımlıydı ama migration yoktu.
-- currency alanları TEXT olarak saklanır (Prisma enum → DB TEXT).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferredCurrency" TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS "preferredLocale"   TEXT NOT NULL DEFAULT 'tr-TR';
