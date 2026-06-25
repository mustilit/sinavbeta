-- E-Sınıf: Ders havuzu (SchoolSubject). Additive + mevcut zümre derslerinden backfill.
CREATE TABLE "school_subjects" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_subjects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_subjects_schoolId_name_key" ON "school_subjects"("schoolId", "name");
CREATE INDEX "school_subjects_schoolId_idx" ON "school_subjects"("schoolId");
ALTER TABLE "school_subjects" ADD CONSTRAINT "school_subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mevcut zümrelerin ders adlarını ders havuzuna taşı
INSERT INTO "school_subjects" ("id", "schoolId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), x."schoolId", x."subject", now(), now()
FROM (SELECT DISTINCT "schoolId", "subject" FROM "departments" WHERE "subject" IS NOT NULL AND TRIM("subject") <> '') x
ON CONFLICT ("schoolId", "name") DO NOTHING;
