-- Migration: discount_codes tablosuna isActive alanı eklendi
-- Eğiticiler artık kodu silmek yerine pasife alabilir; veri kaybı olmaz.
ALTER TABLE "discount_codes" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
