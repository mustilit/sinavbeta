-- E-Sınıf Sprint 2 — sınav içeriği (özel kopya) + havuz. Additive.
CREATE TYPE "SchoolExamType" AS ENUM ('TEST', 'TUNNEL', 'WRITTEN');
CREATE TYPE "PoolVisibility" AS ENUM ('DEPARTMENT', 'SCHOOL');

CREATE TABLE "school_exams" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "examType" "SchoolExamType" NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" INTEGER,
    "topic" TEXT,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "poolVisibility" "PoolVisibility" NOT NULL DEFAULT 'DEPARTMENT',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_exams_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "school_exams_schoolId_departmentId_idx" ON "school_exams"("schoolId", "departmentId");
CREATE INDEX "school_exams_schoolId_gradeLevel_idx" ON "school_exams"("schoolId", "gradeLevel");
CREATE INDEX "school_exams_schoolId_examType_idx" ON "school_exams"("schoolId", "examType");
CREATE INDEX "school_exams_createdById_idx" ON "school_exams"("createdById");

CREATE TABLE "school_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "order" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "solutionText" TEXT,
    "solutionMediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "school_questions_examId_idx" ON "school_questions"("examId");

CREATE TABLE "school_question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    CONSTRAINT "school_question_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "school_question_options_questionId_idx" ON "school_question_options"("questionId");

ALTER TABLE "school_exams" ADD CONSTRAINT "school_exams_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_exams" ADD CONSTRAINT "school_exams_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "school_exams" ADD CONSTRAINT "school_exams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_questions" ADD CONSTRAINT "school_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "school_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_question_options" ADD CONSTRAINT "school_question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "school_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
