-- Migration: add_test_package_published_at
-- TestPackage tablosuna publishedAt alanı eklenir (yayınlama tarihi)
-- educatorId alanı eklenir (paket sahibi eğitici)

ALTER TABLE "test_packages"
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "educatorId" TEXT;
