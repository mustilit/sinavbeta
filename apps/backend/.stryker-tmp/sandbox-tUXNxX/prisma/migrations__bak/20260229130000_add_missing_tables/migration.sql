-- CreateEnum: FollowType (follows tablosu için)
DO $$ BEGIN
  CREATE TYPE "FollowType" AS ENUM ('EDUCATOR', 'EXAM_TYPE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: RefundStatus (refund_requests için)
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: topics
CREATE TABLE IF NOT EXISTS "topics" (
    "id" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "topics_examTypeId_slug_key" ON "topics"("examTypeId", "slug");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_examTypeId_fkey') THEN
    ALTER TABLE "topics" ADD CONSTRAINT "topics_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- CreateTable: test_stats
CREATE TABLE IF NOT EXISTS "test_stats" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_stats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "test_stats_testId_key" ON "test_stats"("testId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_stats_testId_fkey') THEN
    ALTER TABLE "test_stats" ADD CONSTRAINT "test_stats_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- CreateTable: follows
CREATE TABLE IF NOT EXISTS "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followType" "FollowType" NOT NULL,
    "educatorId" TEXT,
    "examTypeId" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "follows_followerId_followType_idx" ON "follows"("followerId", "followType");
CREATE UNIQUE INDEX IF NOT EXISTS "follows_followerId_educatorId_key" ON "follows"("followerId", "educatorId");
CREATE UNIQUE INDEX IF NOT EXISTS "follows_followerId_examTypeId_key" ON "follows"("followerId", "examTypeId");

-- CreateTable: notification_preferences
CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inactiveReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_userId_key" ON "notification_preferences"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_unsubscribeToken_key" ON "notification_preferences"("unsubscribeToken");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_userId_fkey') THEN
    ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- CreateTable: discount_codes
CREATE TABLE IF NOT EXISTS "discount_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_key" ON "discount_codes"("code");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_codes_createdById_fkey') THEN
    ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- CreateTable: refund_requests
CREATE TABLE IF NOT EXISTS "refund_requests" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_purchaseId_key" ON "refund_requests"("purchaseId");
CREATE INDEX IF NOT EXISTS "refund_requests_candidateId_idx" ON "refund_requests"("candidateId");
CREATE INDEX IF NOT EXISTS "refund_requests_testId_idx" ON "refund_requests"("testId");

-- CreateTable: reviews
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "testRating" INTEGER NOT NULL,
    "educatorRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_testId_candidateId_key" ON "reviews"("testId", "candidateId");
CREATE INDEX IF NOT EXISTS "reviews_educatorId_idx" ON "reviews"("educatorId");
CREATE INDEX IF NOT EXISTS "reviews_testId_idx" ON "reviews"("testId");

-- CreateTable: ad_packages
CREATE TABLE IF NOT EXISTS "ad_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_packages_pkey" PRIMARY KEY ("id")
);
