-- Migration: refund_educator_flow
-- Adds multi-step educator review flow to RefundRequest.
-- New statuses: EDUCATOR_APPROVED, EDUCATOR_REJECTED, APPEAL_PENDING, ESCALATED
-- New fields: educatorId, description, educatorDeadline, educatorDecidedAt,
--             appealReason, appealedAt, adminNotes, updatedAt

-- 1. Add new enum values to RefundStatus
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'EDUCATOR_APPROVED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'EDUCATOR_REJECTED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'APPEAL_PENDING';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

-- 2. Add new columns to refund_requests (all nullable to preserve existing rows)
ALTER TABLE "refund_requests"
  ADD COLUMN IF NOT EXISTS "educatorId"        TEXT,
  ADD COLUMN IF NOT EXISTS "description"        TEXT,
  ADD COLUMN IF NOT EXISTS "educatorDeadline"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "educatorDecidedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "appealReason"       TEXT,
  ADD COLUMN IF NOT EXISTS "appealedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminNotes"         TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- 3. Backfill educatorId for existing rows (set empty string as placeholder)
UPDATE "refund_requests" SET "educatorId" = '' WHERE "educatorId" IS NULL;

-- 4. Add index on educatorId
CREATE INDEX IF NOT EXISTS "refund_requests_educatorId_idx" ON "refund_requests"("educatorId");
