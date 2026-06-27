-- E-Sınıf canlı sınav hiyerarşik görünürlüğü — oluşturanın kapsam snapshot'ı (nullable; additive).
-- Marketplace canlı oturumları etkilenmez (hepsi null).
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "schoolBranchId"     TEXT;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "schoolLevelId"      TEXT;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "schoolClassroomId"  TEXT;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "schoolDepartmentId" TEXT;
