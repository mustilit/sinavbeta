-- E-Sınıf: Seviye (SchoolLevel) tablosu + Classroom.levelId/adminUserId. Additive.

-- 1) school_levels tablosu
CREATE TABLE "school_levels" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "gradeLevel" INTEGER NOT NULL,
  "adminUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_levels_branchId_gradeLevel_key" ON "school_levels"("branchId", "gradeLevel");
CREATE INDEX "school_levels_schoolId_idx" ON "school_levels"("schoolId");
ALTER TABLE "school_levels" ADD CONSTRAINT "school_levels_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_levels" ADD CONSTRAINT "school_levels_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_levels" ADD CONSTRAINT "school_levels_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) classrooms: levelId + adminUserId (nullable, additive)
ALTER TABLE "classrooms" ADD COLUMN "levelId" TEXT;
ALTER TABLE "classrooms" ADD COLUMN "adminUserId" TEXT;
CREATE INDEX "classrooms_levelId_idx" ON "classrooms"("levelId");
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "school_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Backfill: mevcut sınıfların (branchId, gradeLevel) kombinasyonlarından seviye üret + bağla
INSERT INTO "school_levels" ("id", "schoolId", "branchId", "gradeLevel", "createdAt", "updatedAt")
SELECT gen_random_uuid(), x."schoolId", x."branchId", x."gradeLevel", now(), now()
FROM (SELECT DISTINCT "schoolId", "branchId", "gradeLevel" FROM "classrooms") x;

UPDATE "classrooms" cl
SET "levelId" = sl."id"
FROM "school_levels" sl
WHERE sl."branchId" = cl."branchId" AND sl."gradeLevel" = cl."gradeLevel";
