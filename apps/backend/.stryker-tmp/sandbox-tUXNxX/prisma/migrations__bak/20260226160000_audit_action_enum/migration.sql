-- CreateEnum: AuditAction (20260228130000 bu enum'a ADD VALUE yapar)
DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'PURCHASE', 'REFUND_REQUESTED', 'REFUND_RESOLVED', 'TEST_PUBLISHED', 'TEST_UNPUBLISHED',
    'PRICE_CHANGED', 'OBJECTION_CREATED', 'OBJECTION_ANSWERED', 'EDUCATOR_APPROVED', 'EDUCATOR_SUSPENDED',
    'EDUCATOR_UNSUSPENDED', 'DISCOUNT_CREATED', 'REVIEW_CREATED', 'SUBMIT_ATTEMPT', 'SUBMIT_ANSWER',
    'NOTIFICATIONS_DISABLED', 'EMAIL_SENT', 'OBJECTION_ESCALATED', 'EMAIL_FAILED', 'REFUND_APPROVED',
    'REFUND_REJECTED', 'REVIEW_UPSERTED', 'EXAMTYPE_CREATED', 'TOPIC_CREATED', 'CONTRACT_ACCEPTED',
    'EDUCATOR_PROFILE_UPDATED', 'EXAMTYPE_UPDATED', 'EXAMTYPE_DELETED', 'TOPIC_UPDATED', 'TOPIC_DELETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL; -- enum zaten varsa devam et
END $$;

-- AlterTable: audit_logs.action TEXT -> AuditAction
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'action';
  IF col_type = 'text' THEN
    ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction" USING (
      COALESCE(NULLIF(trim("action"), ''), 'PURCHASE')::"AuditAction"
    );
  END IF;
END $$;
