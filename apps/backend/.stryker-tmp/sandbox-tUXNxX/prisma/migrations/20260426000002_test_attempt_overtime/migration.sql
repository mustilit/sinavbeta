-- Süreli testlerde gecikmeli teslim süresini (saniye cinsinden) saklar.
-- null: süre aşımı yok (zamanında teslim veya süreli olmayan test).
ALTER TABLE "test_attempts"
  ADD COLUMN IF NOT EXISTS "overtime_seconds" INTEGER;
