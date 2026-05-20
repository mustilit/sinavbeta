-- Migration: add_test_content_limits
-- AdminSettings tablosuna 4 yeni limit alanı eklenir

ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "minQuestionsPerTest" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "maxQuestionsPerTest" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "maxTestsPerPackage"  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "maxLiveQuestions"    INTEGER NOT NULL DEFAULT 50;
