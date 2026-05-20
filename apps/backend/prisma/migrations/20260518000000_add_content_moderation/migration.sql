-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ModerationCategory" AS ENUM ('HATE_SPEECH', 'VIOLENCE', 'SEXUAL_CONTENT', 'SPAM', 'MISINFORMATION', 'PERSONAL_DATA', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ModerationProvider" AS ENUM ('CLAUDE', 'RULE_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EducatorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('WARN', 'CONTENT_REMOVED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ESCALATED_TO_ADMIN');

-- AlterTable: ExamQuestion — moderasyon alanları
ALTER TABLE "exam_questions"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "moderatedAt"      TIMESTAMP(3);

-- AlterTable: ExamOption — moderasyon alanları
ALTER TABLE "exam_options"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "moderatedAt"      TIMESTAMP(3);

-- AlterTable: AdminSettings — moderasyon ayarları
ALTER TABLE "admin_settings"
  ADD COLUMN "moderationEnabled"               BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "moderationClaudeEnabled"         BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "moderationThresholds"            JSONB    NOT NULL DEFAULT '{}',
  ADD COLUMN "moderationAutoSuspendThreshold"  INTEGER  NOT NULL DEFAULT 3,
  ADD COLUMN "moderationAutoBanThreshold"      INTEGER  NOT NULL DEFAULT 10,
  ADD COLUMN "moderationModelText"             TEXT     NOT NULL DEFAULT 'claude-3-haiku-20240307',
  ADD COLUMN "moderationModelVision"           TEXT     NOT NULL DEFAULT 'claude-3-haiku-20240307';

-- AlterTable: User — moderasyon ilişkisi alanları
ALTER TABLE "users"
  ADD COLUMN "suspendedUntil" TIMESTAMP(3),
  ADD COLUMN "isBanned"       BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: blocked_terms
CREATE TABLE "blocked_terms" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "term"      TEXT NOT NULL,
    "isRegex"   BOOLEAN NOT NULL DEFAULT false,
    "category"  "ModerationCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable: moderation_results
CREATE TABLE "moderation_results" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "entityType"     TEXT NOT NULL,
    "entityId"       TEXT NOT NULL,
    "provider"       "ModerationProvider" NOT NULL,
    "status"         "ModerationStatus" NOT NULL,
    "score"          DOUBLE PRECISION,
    "categories"     "ModerationCategory"[],
    "flaggedContent" TEXT,
    "reviewerNote"   TEXT,
    "rawResponse"    JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt"     TIMESTAMP(3),

    CONSTRAINT "moderation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable: moderation_violations
CREATE TABLE "moderation_violations" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "moderationResultId" TEXT,
    "category"           "ModerationCategory" NOT NULL,
    "severity"           INTEGER NOT NULL DEFAULT 1,
    "entityType"         TEXT NOT NULL,
    "entityId"           TEXT NOT NULL,
    "resolvedAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: moderation_actions
CREATE TABLE "moderation_actions" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "actorId"    TEXT,
    "actionType" "ModerationActionType" NOT NULL,
    "reason"     TEXT,
    "metadata"   JSONB NOT NULL DEFAULT '{}',
    "expiresAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: educator_risk_scores
CREATE TABLE "educator_risk_scores" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "riskLevel"      "EducatorRiskLevel" NOT NULL DEFAULT 'LOW',
    "computedScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educator_risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_terms_tenantId_idx" ON "blocked_terms"("tenantId");

-- CreateIndex
CREATE INDEX "blocked_terms_tenantId_category_idx" ON "blocked_terms"("tenantId", "category");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_entityType_entityId_idx" ON "moderation_results"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_status_idx" ON "moderation_results"("tenantId", "status");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_userId_idx" ON "moderation_results"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "moderation_violations_tenantId_userId_createdAt_idx" ON "moderation_violations"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_violations_tenantId_category_idx" ON "moderation_violations"("tenantId", "category");

-- CreateIndex
CREATE INDEX "moderation_actions_tenantId_userId_createdAt_idx" ON "moderation_actions"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_actions_tenantId_actionType_idx" ON "moderation_actions"("tenantId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "educator_risk_scores_userId_key" ON "educator_risk_scores"("userId");

-- CreateIndex
CREATE INDEX "educator_risk_scores_tenantId_riskLevel_computedScore_idx" ON "educator_risk_scores"("tenantId", "riskLevel", "computedScore");

-- AddForeignKey
ALTER TABLE "blocked_terms" ADD CONSTRAINT "blocked_terms_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educator_risk_scores" ADD CONSTRAINT "educator_risk_scores_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educator_risk_scores" ADD CONSTRAINT "educator_risk_scores_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
