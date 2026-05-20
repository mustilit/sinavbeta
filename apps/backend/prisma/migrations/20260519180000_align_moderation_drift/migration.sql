-- Defansif: Phase 2 + sonraki moderasyon migration'larının shared/eski
-- DB'lerde eksik kalan parçalarını idempotent şekilde tamamlar.
-- Tüm ifadeler IF NOT EXISTS / IF NOT EXISTS — mevcut yapıyı bozmaz.

-- ── Enum eksiklikleri ────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ModerationCategory" AS ENUM ('HATE_SPEECH', 'VIOLENCE', 'SEXUAL_CONTENT', 'SPAM', 'MISINFORMATION', 'PERSONAL_DATA', 'COPYRIGHT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ModerationProvider" AS ENUM ('CLAUDE', 'RULE_BASED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "EducatorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ModerationActionType" AS ENUM ('WARN', 'CONTENT_REMOVED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ESCALATED_TO_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'SELF_HARM';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'HARASSMENT';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'ILLEGAL';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'PROFANITY';

-- ── User: ban / suspend ──────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isBanned"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3);

-- ── ExamQuestion / ExamOption: moderation status ─────────────────────────
ALTER TABLE "exam_questions"
  ADD COLUMN IF NOT EXISTS "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN IF NOT EXISTS "moderatedAt"      TIMESTAMP(3);

ALTER TABLE "exam_options"
  ADD COLUMN IF NOT EXISTS "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN IF NOT EXISTS "moderatedAt"      TIMESTAMP(3);

-- ── AdminSettings: moderation + drift ────────────────────────────────────
ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "adPurchasesEnabled"            BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "moderationEnabled"             BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "moderationClaudeEnabled"       BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "moderationThresholds"          JSONB    NOT NULL DEFAULT '{"hate":0.7,"sexual":0.6,"violence":0.7,"selfHarm":0.5,"harassment":0.7,"illegal":0.7,"profanity":0.6}',
  ADD COLUMN IF NOT EXISTS "moderationAutoSuspendThreshold" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "moderationAutoBanThreshold"     INTEGER NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS "moderationModelText"           TEXT     NOT NULL DEFAULT 'claude-haiku-4-5',
  ADD COLUMN IF NOT EXISTS "moderationModelVision"         TEXT     NOT NULL DEFAULT 'claude-sonnet-4-6';

-- ── CommissionRateHistory tablosu ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "commission_rate_history" (
  "id"                TEXT PRIMARY KEY,
  "commissionPercent" INTEGER NOT NULL,
  "effectiveFrom"     TIMESTAMP(3) NOT NULL,
  "note"              TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "commission_rate_history_effectiveFrom_idx" ON "commission_rate_history"("effectiveFrom");

-- ── BlockedTerm ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "blocked_terms" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL,
  "term"      TEXT NOT NULL,
  "pattern"   TEXT,
  "category"  "ModerationCategory" NOT NULL,
  "severity"  INTEGER NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "blocked_terms_tenantId_term_key" ON "blocked_terms"("tenantId","term");
CREATE INDEX        IF NOT EXISTS "blocked_terms_tenantId_isActive_idx" ON "blocked_terms"("tenantId","isActive");
CREATE INDEX        IF NOT EXISTS "blocked_terms_tenantId_category_idx" ON "blocked_terms"("tenantId","category");

-- ── ModerationResult ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "moderation_results" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "entityType"     TEXT NOT NULL,
  "entityId"       TEXT NOT NULL,
  "provider"       "ModerationProvider" NOT NULL,
  "status"         "ModerationStatus" NOT NULL,
  "score"          DOUBLE PRECISION,
  "scores"         JSONB,
  "categories"     "ModerationCategory"[] NOT NULL DEFAULT '{}',
  "matchedTerms"   TEXT[] NOT NULL DEFAULT '{}',
  "flaggedContent" TEXT,
  "reasonText"     TEXT,
  "reviewerNote"   TEXT,
  "rawResponse"    JSONB,
  "cost"           DECIMAL(10,6),
  "latencyMs"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"     TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "moderation_results_tenantId_entityType_entityId_idx" ON "moderation_results"("tenantId","entityType","entityId");
CREATE INDEX IF NOT EXISTS "moderation_results_tenantId_status_idx" ON "moderation_results"("tenantId","status");
CREATE INDEX IF NOT EXISTS "moderation_results_tenantId_userId_idx" ON "moderation_results"("tenantId","userId");

-- ── ModerationViolation ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "moderation_violations" (
  "id"                 TEXT PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "moderationResultId" TEXT,
  "category"           "ModerationCategory" NOT NULL,
  "severity"           INTEGER NOT NULL DEFAULT 1,
  "status"             TEXT NOT NULL DEFAULT 'OPEN',
  "entityType"         TEXT NOT NULL,
  "entityId"           TEXT NOT NULL,
  "adminNote"          TEXT,
  "reviewedBy"         TEXT,
  "reviewedAt"         TIMESTAMP(3),
  "resolvedAt"         TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "moderation_violations_tenantId_userId_createdAt_idx" ON "moderation_violations"("tenantId","userId","createdAt");
CREATE INDEX IF NOT EXISTS "moderation_violations_tenantId_status_severity_createdAt_idx" ON "moderation_violations"("tenantId","status","severity","createdAt");
CREATE INDEX IF NOT EXISTS "moderation_violations_tenantId_category_idx" ON "moderation_violations"("tenantId","category");

-- ── ModerationAction ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "moderation_actions" (
  "id"         TEXT PRIMARY KEY,
  "tenantId"   TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "actorId"    TEXT,
  "actionType" "ModerationActionType" NOT NULL,
  "reason"     TEXT,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "expiresAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "moderation_actions_tenantId_userId_createdAt_idx" ON "moderation_actions"("tenantId","userId","createdAt");
CREATE INDEX IF NOT EXISTS "moderation_actions_tenantId_actionType_idx" ON "moderation_actions"("tenantId","actionType");

-- ── EducatorRiskScore ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "educator_risk_scores" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "userId"            TEXT NOT NULL UNIQUE,
  "riskLevel"         "EducatorRiskLevel" NOT NULL DEFAULT 'LOW',
  "computedScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "violationCount"    INTEGER NOT NULL DEFAULT 0,
  "openViolations"    INTEGER NOT NULL DEFAULT 0,
  "highSeverityCount" INTEGER NOT NULL DEFAULT 0,
  "lastViolationAt"   TIMESTAMP(3),
  "lastComputedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "educator_risk_scores_tenantId_riskLevel_computedScore_idx" ON "educator_risk_scores"("tenantId","riskLevel","computedScore");
CREATE INDEX IF NOT EXISTS "educator_risk_scores_tenantId_lastViolationAt_idx" ON "educator_risk_scores"("tenantId","lastViolationAt");
