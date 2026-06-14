-- TÜNEL Faz 2: satış + aday adaptif çözme motoru.
CREATE TYPE "TunnelAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "tunnel_purchases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tunnelId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    CONSTRAINT "tunnel_purchases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tunnel_purchases_candidateId_tunnelId_key" ON "tunnel_purchases"("candidateId", "tunnelId");
CREATE INDEX "tunnel_purchases_tunnelId_idx" ON "tunnel_purchases"("tunnelId");

CREATE TABLE "tunnel_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tunnelId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "TunnelAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "baseLayer" INTEGER NOT NULL DEFAULT 1,
    "upperOpen" BOOLEAN NOT NULL DEFAULT false,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "currentQuestionId" TEXT,
    "currentCorrectPosition" INTEGER,
    "currentOrderJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tunnel_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tunnel_attempts_candidateId_tunnelId_key" ON "tunnel_attempts"("candidateId", "tunnelId");
CREATE INDEX "tunnel_attempts_tunnelId_idx" ON "tunnel_attempts"("tunnelId");

CREATE TABLE "tunnel_question_progress" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "correctMask" INTEGER NOT NULL DEFAULT 0,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tunnel_question_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tunnel_question_progress_attemptId_questionId_key" ON "tunnel_question_progress"("attemptId", "questionId");
CREATE INDEX "tunnel_question_progress_attemptId_idx" ON "tunnel_question_progress"("attemptId");

ALTER TABLE "tunnel_purchases" ADD CONSTRAINT "tunnel_purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tunnel_purchases" ADD CONSTRAINT "tunnel_purchases_tunnelId_fkey" FOREIGN KEY ("tunnelId") REFERENCES "tunnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_purchases" ADD CONSTRAINT "tunnel_purchases_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_attempts" ADD CONSTRAINT "tunnel_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tunnel_attempts" ADD CONSTRAINT "tunnel_attempts_tunnelId_fkey" FOREIGN KEY ("tunnelId") REFERENCES "tunnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_attempts" ADD CONSTRAINT "tunnel_attempts_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_question_progress" ADD CONSTRAINT "tunnel_question_progress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "tunnel_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_question_progress" ADD CONSTRAINT "tunnel_question_progress_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "tunnel_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
