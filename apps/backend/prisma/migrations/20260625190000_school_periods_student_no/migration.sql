-- E-Sınıf: çoklu okul-dönem yetkilendirmesi (school_periods) + öğrenci numarası. Additive.

-- 1) school_periods (çoklu dönem)
CREATE TABLE "school_periods" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_periods_schoolId_periodId_key" ON "school_periods"("schoolId", "periodId");
CREATE INDEX "school_periods_schoolId_idx" ON "school_periods"("schoolId");
CREATE INDEX "school_periods_periodId_idx" ON "school_periods"("periodId");
ALTER TABLE "school_periods" ADD CONSTRAINT "school_periods_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_periods" ADD CONSTRAINT "school_periods_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mevcut okulların kuruluş dönemini yetkilendirme olarak ekle
INSERT INTO "school_periods" ("id", "schoolId", "periodId", "createdAt")
SELECT gen_random_uuid(), "id", "periodId", now() FROM "schools" WHERE "periodId" IS NOT NULL
ON CONFLICT ("schoolId", "periodId") DO NOTHING;

-- 2) öğrenci numarası
ALTER TABLE "school_users" ADD COLUMN "studentNo" TEXT;
