-- Sınıf silme yerine pasife alma (soft). Mevcut sınıflar aktif kabul edilir.
ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
