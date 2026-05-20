-- Ensure answeredAt column exists (idempotent; owner join is application-layer)
ALTER TABLE "objections" ADD COLUMN IF NOT EXISTS "answeredAt" TIMESTAMP(3);
