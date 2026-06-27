-- Marketplace satış birimlerine "Sınav Dili" (soruların hazırlandığı dil) eklenir.
-- Additive + NOT NULL DEFAULT 'tr' → mevcut kayıtlar Türkçe varsayılır.
ALTER TABLE "test_packages"    ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'tr';
ALTER TABLE "tunnels"          ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'tr';
ALTER TABLE "written_packages" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'tr';
