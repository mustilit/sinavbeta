-- E-Sınıf Sprint 3 — ödev + öğrenci çözme. Additive.
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'CLOSED');
CREATE TYPE "ResultVisibility" AS ENUM ('SUBMIT', 'DUE_DATE', 'TEACHER_RELEASE');
CREATE TYPE "SchoolSubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'OVERDUE');

CREATE TABLE "school_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "availableFrom" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "allowLateSubmit" BOOLEAN NOT NULL DEFAULT false,
    "showResultAfter" "ResultVisibility" NOT NULL DEFAULT 'SUBMIT',
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "resultsReleased" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "school_assignments_classroomId_status_idx" ON "school_assignments"("classroomId", "status");
CREATE INDEX "school_assignments_examId_idx" ON "school_assignments"("examId");
CREATE INDEX "school_assignments_schoolId_idx" ON "school_assignments"("schoolId");

CREATE TABLE "school_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SchoolSubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "totalScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,
    CONSTRAINT "school_submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_submissions_assignmentId_studentId_key" ON "school_submissions"("assignmentId", "studentId");
CREATE INDEX "school_submissions_assignmentId_status_idx" ON "school_submissions"("assignmentId", "status");
CREATE INDEX "school_submissions_studentId_idx" ON "school_submissions"("studentId");

CREATE TABLE "school_submission_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "textAnswer" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCorrect" BOOLEAN,
    "earnedPoints" DOUBLE PRECISION,
    "maxPoints" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_submission_answers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_submission_answers_submissionId_questionId_key" ON "school_submission_answers"("submissionId", "questionId");
CREATE INDEX "school_submission_answers_submissionId_idx" ON "school_submission_answers"("submissionId");

ALTER TABLE "school_assignments" ADD CONSTRAINT "school_assignments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "school_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments" ADD CONSTRAINT "school_assignments_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments" ADD CONSTRAINT "school_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_submissions" ADD CONSTRAINT "school_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "school_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_submissions" ADD CONSTRAINT "school_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_submission_answers" ADD CONSTRAINT "school_submission_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "school_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
