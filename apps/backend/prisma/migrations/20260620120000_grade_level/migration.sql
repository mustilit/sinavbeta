-- Sınıf (GradeLevel) — ExamType deseni. Drift satırları (live_participants FK,
-- test_packages.search_vector, search_idx) bilinçli olarak hariç tutuldu.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'GRADELEVEL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADELEVEL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADELEVEL_DELETED';

-- AlterTable
ALTER TABLE "exam_tests" ADD COLUMN "gradeLevelId" TEXT;

-- AlterTable
ALTER TABLE "tunnels" ADD COLUMN "gradeLevelId" TEXT;

-- AlterTable
ALTER TABLE "written_packages" ADD COLUMN "gradeLevelId" TEXT;

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_slug_key" ON "grade_levels"("slug");

-- CreateIndex
CREATE INDEX "tunnels_gradeLevelId_idx" ON "tunnels"("gradeLevelId");

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
