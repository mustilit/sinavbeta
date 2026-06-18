-- CreateTable
CREATE TABLE "written_packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "educatorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "written_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_tests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "educatorId" TEXT,
    "examTypeId" TEXT,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER,
    "questionCount" INTEGER,
    "hasSolutions" BOOLEAN NOT NULL DEFAULT true,
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "written_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_questions" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "solutionText" TEXT,
    "solutionMediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "written_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "metadata" JSONB,
    "lastResumedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "remainingSec" INTEGER,
    "overtimeSeconds" INTEGER,
    "questionsSnapshot" JSONB,

    CONSTRAINT "written_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "textAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "written_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_purchases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "amountCents" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "amountUsdCents" INTEGER,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountCodeId" TEXT,
    "discountAmountCents" INTEGER,
    "paymentProvider" TEXT,
    "distanceSaleContractId" TEXT,
    "distanceSaleAcceptedAt" TIMESTAMP(3),
    "distanceSaleAcceptedIp" TEXT,
    "distanceSaleAcceptedUserAgent" TEXT,
    "testsSnapshot" JSONB,
    "attemptsResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "written_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "written_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "written_question_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "testId" TEXT,
    "questionId" TEXT,
    "candidateId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "written_question_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "written_packages_tenantId_idx" ON "written_packages"("tenantId");

-- CreateIndex
CREATE INDEX "written_packages_educatorId_idx" ON "written_packages"("educatorId");

-- CreateIndex
CREATE INDEX "written_packages_publishedAt_idx" ON "written_packages"("publishedAt");

-- CreateIndex
CREATE INDEX "written_tests_tenantId_idx" ON "written_tests"("tenantId");

-- CreateIndex
CREATE INDEX "written_tests_packageId_idx" ON "written_tests"("packageId");

-- CreateIndex
CREATE INDEX "written_tests_educatorId_idx" ON "written_tests"("educatorId");

-- CreateIndex
CREATE INDEX "written_tests_publishedAt_idx" ON "written_tests"("publishedAt");

-- CreateIndex
CREATE INDEX "written_questions_testId_idx" ON "written_questions"("testId");

-- CreateIndex
CREATE INDEX "written_attempts_candidateId_idx" ON "written_attempts"("candidateId");

-- CreateIndex
CREATE INDEX "written_attempts_testId_idx" ON "written_attempts"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "written_attempts_testId_candidateId_attemptNumber_key" ON "written_attempts"("testId", "candidateId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "written_answers_attemptId_questionId_key" ON "written_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "written_purchases_tenantId_idx" ON "written_purchases"("tenantId");

-- CreateIndex
CREATE INDEX "written_purchases_packageId_idx" ON "written_purchases"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "written_purchases_candidateId_packageId_key" ON "written_purchases"("candidateId", "packageId");

-- CreateIndex
CREATE INDEX "written_reviews_packageId_idx" ON "written_reviews"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "written_reviews_packageId_candidateId_key" ON "written_reviews"("packageId", "candidateId");

-- CreateIndex
CREATE INDEX "written_question_reports_testId_status_idx" ON "written_question_reports"("testId", "status");
-- AddForeignKey
ALTER TABLE "written_tests" ADD CONSTRAINT "written_tests_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "written_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "written_questions" ADD CONSTRAINT "written_questions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "written_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "written_attempts" ADD CONSTRAINT "written_attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "written_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "written_answers" ADD CONSTRAINT "written_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "written_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "written_answers" ADD CONSTRAINT "written_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "written_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "written_purchases" ADD CONSTRAINT "written_purchases_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "written_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

