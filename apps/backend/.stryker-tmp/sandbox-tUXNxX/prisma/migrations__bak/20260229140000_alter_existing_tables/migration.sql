-- AlterTable: users - educatorApprovedAt, lastLoginAt
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "educatorApprovedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- AlterTable: exam_types - slug, active
ALTER TABLE "exam_types" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "exam_types" ADD COLUMN IF NOT EXISTS "active" BOOLEAN DEFAULT true;
-- Backfill slug for existing rows (id-based for uniqueness)
UPDATE "exam_types" SET "slug" = "id" WHERE "slug" IS NULL;
UPDATE "exam_types" SET "active" = true WHERE "active" IS NULL;
-- Only set NOT NULL if no nulls remain
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "exam_types" WHERE "slug" IS NULL) THEN
    ALTER TABLE "exam_types" ALTER COLUMN "slug" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "exam_types" WHERE "active" IS NULL) THEN
    ALTER TABLE "exam_types" ALTER COLUMN "active" SET NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "exam_types_slug_key" ON "exam_types"("slug");

-- AlterTable: exam_tests - topicId, priceCents, questionCount, hasSolutions, currency
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "topicId" TEXT;
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER;
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "questionCount" INTEGER;
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "hasSolutions" BOOLEAN DEFAULT false;
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'TRY';
-- Backfill priceCents from price if exists
UPDATE "exam_tests" SET "priceCents" = ROUND("price"::numeric * 100)::integer WHERE "priceCents" IS NULL AND "price" IS NOT NULL;
UPDATE "exam_tests" SET "hasSolutions" = false WHERE "hasSolutions" IS NULL;
UPDATE "exam_tests" SET "currency" = 'TRY' WHERE "currency" IS NULL;
ALTER TABLE "exam_tests" ALTER COLUMN "hasSolutions" SET DEFAULT false;
ALTER TABLE "exam_tests" ALTER COLUMN "currency" SET DEFAULT 'TRY';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_tests_topicId_fkey') THEN
    ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- AlterTable: purchases - amountCents, currency, discountCodeId
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "amountCents" INTEGER;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'TRY';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "discountCodeId" TEXT;
UPDATE "purchases" SET "amountCents" = ROUND("amount"::numeric * 100)::integer WHERE "amountCents" IS NULL AND "amount" IS NOT NULL;
UPDATE "purchases" SET "currency" = 'TRY' WHERE "currency" IS NULL;
ALTER TABLE "purchases" ALTER COLUMN "currency" SET DEFAULT 'TRY';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'discount_codes') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_discountCodeId_fkey') THEN
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- AlterTable: test_attempts - submittedAt, metadata
ALTER TABLE "test_attempts" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "test_attempts" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- AlterTable: exam_questions - solutionText, solutionMediaUrl
ALTER TABLE "exam_questions" ADD COLUMN IF NOT EXISTS "solutionText" TEXT;
ALTER TABLE "exam_questions" ADD COLUMN IF NOT EXISTS "solutionMediaUrl" TEXT;
