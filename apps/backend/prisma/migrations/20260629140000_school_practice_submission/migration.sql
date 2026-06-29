-- E-Sınıf: serbest alıştırma (Keşfet) — exam-scoped, ödevsiz teslim.
-- SchoolSubmission artık hem ÖDEV (assignmentId) hem ALIŞTIRMA (examId) tutar.

-- 1) assignmentId artık opsiyonel (alıştırmada null)
ALTER TABLE "school_submissions" ALTER COLUMN "assignmentId" DROP NOT NULL;

-- 2) yeni alanlar
ALTER TABLE "school_submissions" ADD COLUMN "examId" TEXT;
ALTER TABLE "school_submissions" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ASSIGNMENT';

-- 3) examId FK (alıştırma sınavı silinince teslimler de silinir)
ALTER TABLE "school_submissions"
  ADD CONSTRAINT "school_submissions_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "school_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) alıştırma tekilliği + index (examId NULL satırlar Postgres'te çakışmaz)
CREATE UNIQUE INDEX "school_submissions_examId_studentId_key" ON "school_submissions"("examId", "studentId");
CREATE INDEX "school_submissions_examId_status_idx" ON "school_submissions"("examId", "status");
