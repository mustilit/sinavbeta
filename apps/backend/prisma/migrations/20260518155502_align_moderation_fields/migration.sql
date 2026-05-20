-- İçerik moderasyonu şemasını plan dosyasına hizalar.
-- Bu migration YALNIZCA moderasyon-ilgili değişiklikleri içerir; başka tablolardaki
-- prisma diff sapmaları kapsam dışı (ayrı bir migration'da ele alınmalı).

-- AlterEnum — yeni kategoriler
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'SELF_HARM';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'HARASSMENT';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'ILLEGAL';
ALTER TYPE "ModerationCategory" ADD VALUE IF NOT EXISTS 'PROFANITY';

-- BlockedTerm: isRegex → pattern, severity, isActive, createdBy
ALTER TABLE "blocked_terms" DROP COLUMN IF EXISTS "isRegex";
ALTER TABLE "blocked_terms" ADD COLUMN IF NOT EXISTS "pattern" TEXT;
ALTER TABLE "blocked_terms" ADD COLUMN IF NOT EXISTS "severity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "blocked_terms" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "blocked_terms" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

DROP INDEX IF EXISTS "blocked_terms_tenantId_idx";
CREATE INDEX IF NOT EXISTS "blocked_terms_tenantId_isActive_idx" ON "blocked_terms"("tenantId", "isActive");

-- ModerationResult: scores, matchedTerms, reasonText, cost, latencyMs
ALTER TABLE "moderation_results" ADD COLUMN IF NOT EXISTS "scores" JSONB;
ALTER TABLE "moderation_results" ADD COLUMN IF NOT EXISTS "matchedTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "moderation_results" ADD COLUMN IF NOT EXISTS "reasonText" TEXT;
ALTER TABLE "moderation_results" ADD COLUMN IF NOT EXISTS "cost" DECIMAL(10,6);
ALTER TABLE "moderation_results" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER NOT NULL DEFAULT 0;

-- ModerationViolation: status, adminNote, reviewedBy, reviewedAt
ALTER TABLE "moderation_violations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "moderation_violations" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
ALTER TABLE "moderation_violations" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "moderation_violations" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "moderation_violations_tenantId_status_severity_createdAt_idx"
  ON "moderation_violations"("tenantId", "status", "severity", "createdAt");

-- EducatorRiskScore: openViolations, highSeverityCount, lastViolationAt
ALTER TABLE "educator_risk_scores" ADD COLUMN IF NOT EXISTS "openViolations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "educator_risk_scores" ADD COLUMN IF NOT EXISTS "highSeverityCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "educator_risk_scores" ADD COLUMN IF NOT EXISTS "lastViolationAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "educator_risk_scores_tenantId_lastViolationAt_idx"
  ON "educator_risk_scores"("tenantId", "lastViolationAt");

-- AdminSettings: moderasyon default'larını plan'a hizala (mevcut satırları da güncelle)
ALTER TABLE "admin_settings" ALTER COLUMN "moderationEnabled" SET DEFAULT true;
ALTER TABLE "admin_settings" ALTER COLUMN "moderationClaudeEnabled" SET DEFAULT true;
ALTER TABLE "admin_settings" ALTER COLUMN "moderationThresholds" SET DEFAULT '{"hate":0.7,"sexual":0.6,"violence":0.7,"selfHarm":0.5,"harassment":0.7,"illegal":0.7,"profanity":0.6}';
ALTER TABLE "admin_settings" ALTER COLUMN "moderationAutoSuspendThreshold" SET DEFAULT 80;
ALTER TABLE "admin_settings" ALTER COLUMN "moderationAutoBanThreshold" SET DEFAULT 95;
ALTER TABLE "admin_settings" ALTER COLUMN "moderationModelText" SET DEFAULT 'claude-haiku-4-5';
ALTER TABLE "admin_settings" ALTER COLUMN "moderationModelVision" SET DEFAULT 'claude-sonnet-4-6';

UPDATE "admin_settings"
SET "moderationEnabled" = true,
    "moderationClaudeEnabled" = true,
    "moderationThresholds" = '{"hate":0.7,"sexual":0.6,"violence":0.7,"selfHarm":0.5,"harassment":0.7,"illegal":0.7,"profanity":0.6}'::jsonb,
    "moderationAutoSuspendThreshold" = 80,
    "moderationAutoBanThreshold" = 95,
    "moderationModelText" = 'claude-haiku-4-5',
    "moderationModelVision" = 'claude-sonnet-4-6'
WHERE "id" = 1;
