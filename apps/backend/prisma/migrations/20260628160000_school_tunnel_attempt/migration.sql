-- E-Sınıf tünel adaptif çözme: attempt + progress tabloları (market TunnelAttempt deseni).
CREATE TABLE "school_tunnel_attempts" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "baseLayer" INTEGER NOT NULL DEFAULT 1,
  "upperOpen" BOOLEAN NOT NULL DEFAULT false,
  "streakCount" INTEGER NOT NULL DEFAULT 0,
  "currentQuestionId" TEXT,
  "currentCorrectPosition" INTEGER,
  "currentOrderJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_tunnel_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_tunnel_attempts_examId_studentId_key" ON "school_tunnel_attempts"("examId", "studentId");
CREATE INDEX "school_tunnel_attempts_studentId_idx" ON "school_tunnel_attempts"("studentId");
ALTER TABLE "school_tunnel_attempts" ADD CONSTRAINT "school_tunnel_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "school_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "school_tunnel_progress" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "correctMask" INTEGER NOT NULL DEFAULT 0,
  "mastered" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "school_tunnel_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_tunnel_progress_attemptId_questionId_key" ON "school_tunnel_progress"("attemptId", "questionId");
CREATE INDEX "school_tunnel_progress_attemptId_idx" ON "school_tunnel_progress"("attemptId");
ALTER TABLE "school_tunnel_progress" ADD CONSTRAINT "school_tunnel_progress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "school_tunnel_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
