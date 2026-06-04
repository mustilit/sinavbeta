-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD', 'EUR', 'GBP');

-- CreateEnum
CREATE TYPE "SubscriberKind" AS ENUM ('EDUCATOR', 'TENANT');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDUCATOR', 'CANDIDATE', 'WORKER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_EDUCATOR_APPROVAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'TIMEOUT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PURCHASE', 'REFUND_REQUESTED', 'REFUND_RESOLVED', 'TEST_PUBLISHED', 'TEST_UNPUBLISHED', 'PRICE_CHANGED', 'OBJECTION_CREATED', 'OBJECTION_ANSWERED', 'EDUCATOR_APPROVED', 'EDUCATOR_REJECTED', 'EDUCATOR_RESUBMITTED', 'EDUCATOR_SUSPENDED', 'EDUCATOR_UNSUSPENDED', 'DISCOUNT_CREATED', 'REVIEW_CREATED', 'SUBMIT_ATTEMPT', 'SUBMIT_ANSWER', 'NOTIFICATIONS_DISABLED', 'EMAIL_SENT', 'OBJECTION_ESCALATED', 'EMAIL_FAILED', 'REFUND_APPROVED', 'REFUND_REJECTED', 'REVIEW_UPSERTED', 'EXAMTYPE_CREATED', 'TOPIC_CREATED', 'CONTRACT_ACCEPTED', 'EDUCATOR_PROFILE_UPDATED', 'EXAMTYPE_UPDATED', 'EXAMTYPE_DELETED', 'TOPIC_UPDATED', 'TOPIC_DELETED', 'CSP_VIOLATION', 'SUSPICIOUS_RATE_LIMIT', 'DEVICE_QUOTA_EXCEEDED', 'AUTH_MFA_ENABLED', 'AUTH_MFA_DISABLED', 'AUTH_MFA_RECOVERY_USED', 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAIL', 'USER_ROLE_CHANGED', 'USER_SUSPENDED', 'USER_DELETED', 'ADMIN_SETTINGS_UPDATED', 'PAYOUT_PROCESSED', 'BACKUP_RUN', 'WEBHOOK_RECEIVED', 'WEBHOOK_REJECTED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELED', 'EMAIL_PROVIDER_CREATED', 'EMAIL_PROVIDER_UPDATED', 'EMAIL_PROVIDER_DELETED', 'EMAIL_PROVIDER_TESTED', 'EMAIL_KILL_SWITCH_CHANGED', 'EMAIL_SUPPRESSION_ADDED', 'EMAIL_SUPPRESSION_REMOVED', 'EMAIL_TEMPLATE_UPDATED', 'EMAIL_RETRY_TRIGGERED', 'EMAIL_PREFERENCES_UPDATED', 'EMAIL_UNSUBSCRIBE');

-- CreateEnum
CREATE TYPE "EmailQueue" AS ENUM ('CRITICAL', 'NOTIFY', 'BULK');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED', 'BLOCKED_BY_PREFS', 'BLOCKED_BY_ADMIN', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'HARD_BOUNCED', 'SOFT_BOUNCED', 'COMPLAINED', 'OPENED', 'CLICKED', 'FAILED', 'RETRYING', 'SUPPRESSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EmailProviderKind" AS ENUM ('BREVO_API', 'SMTP', 'CONSOLE');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('HARD_BOUNCE', 'REPEATED_SOFT_BOUNCE', 'SPAM_COMPLAINT', 'UNSUBSCRIBE', 'MANUAL_BLOCK', 'INVALID_ADDRESS');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ModerationCategory" AS ENUM ('HATE_SPEECH', 'VIOLENCE', 'SEXUAL_CONTENT', 'SELF_HARM', 'HARASSMENT', 'ILLEGAL', 'PROFANITY', 'SPAM', 'MISINFORMATION', 'PERSONAL_DATA', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ModerationProvider" AS ENUM ('CLAUDE', 'RULE_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EducatorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('WARN', 'CONTENT_REMOVED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ESCALATED_TO_ADMIN');

-- CreateEnum
CREATE TYPE "ObjectionStatus" AS ENUM ('OPEN', 'ANSWERED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CANDIDATE', 'EDUCATOR', 'PRIVACY', 'DISTANCE_SALE');

-- CreateEnum
CREATE TYPE "AdTargetType" AS ENUM ('TEST', 'EDUCATOR');

-- CreateEnum
CREATE TYPE "FollowType" AS ENUM ('EDUCATOR', 'EXAM_TYPE');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'EDUCATOR_APPROVED', 'EDUCATOR_REJECTED', 'APPEAL_PENDING', 'ESCALATED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlatformPromoScope" AS ENUM ('LIVE_SESSION', 'AD_PACKAGE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "googleId" TEXT,
    "bio" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CANDIDATE',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "educatorApprovedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetTokenExpiresAt" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationTokenExpiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorRecovery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "twoFactorEnabledAt" TIMESTAMP(3),
    "preferredCurrency" "Currency" NOT NULL DEFAULT 'TRY',
    "preferredLocale" TEXT NOT NULL DEFAULT 'tr-TR',
    "emailPreferences" JSONB NOT NULL DEFAULT '{"marketing":false,"productUpdates":true,"weeklyDigest":true,"reviewNotifications":true,"objectionUpdates":true,"liveSessionInvites":true,"refundUpdates":true}',
    "emailUnsubscribeToken" TEXT,
    "activeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "suspendedUntil" TIMESTAMP(3),
    "isBanned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CANDIDATE',
    "acceptedTermsContractId" TEXT,
    "acceptedPrivacyContractId" TEXT,
    "verificationToken" TEXT NOT NULL,
    "verificationTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_exam_types" (
    "topicId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,

    CONSTRAINT "topic_exam_types_pkey" PRIMARY KEY ("topicId","examTypeId")
);

-- CreateTable
CREATE TABLE "exam_tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "examTypeId" TEXT,
    "topicId" TEXT,
    "educatorId" TEXT,
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER,
    "priceCents" INTEGER,
    "campaignPriceCents" INTEGER,
    "campaignValidFrom" TIMESTAMP(3),
    "campaignValidUntil" TIMESTAMP(3),
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "campaignCurrency" "Currency",
    "questionCount" INTEGER,
    "hasSolutions" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "durationSec" INTEGER,

    CONSTRAINT "exam_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "solutionText" TEXT,
    "solutionMediaUrl" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_attempts" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "lastResumedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "remainingSec" INTEGER,
    "overtimeSeconds" INTEGER,
    "questionsSnapshot" JSONB,

    CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_stats" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "amountCents" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "amountUsdCents" INTEGER,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "discountCodeId" TEXT,
    "packageId" TEXT,
    "paymentProvider" TEXT,
    "distanceSaleContractId" UUID,
    "distanceSaleAcceptedAt" TIMESTAMP(3),
    "distanceSaleAcceptedIp" TEXT,
    "distanceSaleAcceptedUserAgent" TEXT,
    "testsSnapshot" JSONB,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "educatorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_views" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "viewerId" TEXT,
    "sessionId" VARCHAR(64),
    "ipHash" VARCHAR(64),
    "referrer" VARCHAR(500),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followType" "FollowType" NOT NULL,
    "educatorId" TEXT,
    "examTypeId" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
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

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT,
    "tenantId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objections" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ObjectionStatus" NOT NULL DEFAULT 'OPEN',
    "answerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "moderationResultId" TEXT,
    "adminAnswerText" TEXT,
    "adminAnsweredAt" TIMESTAMP(3),
    "adminAnswererId" TEXT,

    CONSTRAINT "objections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "reason" TEXT,
    "description" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "educatorDeadline" TIMESTAMP(3),
    "educatorDecidedAt" TIMESTAMP(3),
    "appealReason" TEXT,
    "appealedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "packageId" TEXT,
    "testId" TEXT,
    "educatorId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "testRating" INTEGER,
    "educatorRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "type" "ContractType" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_acceptances" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "contract_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "trustToken" TEXT,
    "trustTokenExpiresAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "commissionPercent" INTEGER NOT NULL DEFAULT 20,
    "vatPercent" INTEGER NOT NULL DEFAULT 18,
    "purchasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "packageCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "testPublishingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "testAttemptsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adPurchasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorSystemEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minPackagePriceCents" INTEGER NOT NULL DEFAULT 100,
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 50,
    "googleClientId" TEXT,
    "turnstileSiteKey" TEXT,
    "turnstileSecretKey" TEXT,
    "minQuestionsPerTest" INTEGER NOT NULL DEFAULT 1,
    "maxQuestionsPerTest" INTEGER NOT NULL DEFAULT 100,
    "maxTestsPerPackage" INTEGER NOT NULL DEFAULT 10,
    "maxLiveQuestions" INTEGER NOT NULL DEFAULT 50,
    "moderationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moderationClaudeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moderationThresholds" JSONB NOT NULL DEFAULT '{"hate":0.7,"sexual":0.6,"violence":0.7,"selfHarm":0.5,"harassment":0.7,"illegal":0.7,"profanity":0.6}',
    "moderationAutoSuspendThreshold" INTEGER NOT NULL DEFAULT 80,
    "moderationAutoBanThreshold" INTEGER NOT NULL DEFAULT 95,
    "moderationModelText" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "moderationModelVision" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEducatorCriticalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEducatorNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEducatorBulkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailCandidateCriticalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailCandidateNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailCandidateBulkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailStaffCriticalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailStaffNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailDailyCapPerUser" INTEGER NOT NULL DEFAULT 20,
    "emailBounceRateAlertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "emailRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "emailBulkAutoPausedAt" TIMESTAMP(3),
    "emailBulkAutoPausedReason" TEXT,
    "emailSendWindowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailSendWindowStartHour" INTEGER NOT NULL DEFAULT 9,
    "emailSendWindowEndHour" INTEGER NOT NULL DEFAULT 21,
    "emailSendWindowTimezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "emailSendWindowAppliesToCritical" BOOLEAN NOT NULL DEFAULT false,
    "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCronExpression" TEXT,
    "backupTargetDir" TEXT,
    "backupRetentionDays" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rate_history" (
    "id" TEXT NOT NULL,
    "commissionPercent" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "searchPlaceholder" TEXT,
    "statTests" TEXT,
    "statEducators" TEXT,
    "statCandidates" TEXT,
    "statSuccessRate" TEXT,
    "footerDescription" TEXT,
    "companyName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "linkAbout" TEXT,
    "linkPrivacy" TEXT,
    "linkContact" TEXT,
    "linkPartnership" TEXT,
    "linkSupport" TEXT,
    "copyrightText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_purchases" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "adPackageId" TEXT NOT NULL,
    "targetType" "AdTargetType" NOT NULL DEFAULT 'TEST',
    "testId" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "impressionsRemaining" INTEGER NOT NULL DEFAULT 0,
    "impressionsDelivered" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "paidCents" INTEGER,
    "platformPromoCodeId" UUID,
    "platformPromoDiscountCents" INTEGER,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ad_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "testId" TEXT,
    "viewerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "kind" "SubscriberKind" NOT NULL DEFAULT 'TENANT',
    "subscriberId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "providerRef" TEXT,
    "customerRef" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT,
    "status" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'test',
    "iyzicoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "iyzicoApiKey" TEXT,
    "iyzicoSecretKey" TEXT,
    "iyzicoBaseUrl" TEXT NOT NULL DEFAULT 'https://sandbox-api.iyzipay.com',
    "googlePayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "googlePayMerchantId" TEXT,
    "amazonPayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "amazonPayMerchantId" TEXT,
    "companyName" TEXT,
    "companyTaxId" TEXT,
    "companyAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_session_tiers" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minParticipants" INTEGER NOT NULL DEFAULT 0,
    "maxParticipants" INTEGER,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_session_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "tierId" TEXT,
    "maxParticipants" INTEGER,
    "current_participant_count" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentQuestionIdx" INTEGER NOT NULL DEFAULT 0,
    "showStats" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "parentSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidCents" INTEGER,
    "platformPromoCodeId" UUID,
    "platformPromoDiscountCents" INTEGER,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "live_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "join_ip" TEXT,

    CONSTRAINT "live_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_answers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "optionId" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pages" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_provider_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EmailProviderKind" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "encryptedSecrets" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "dailySentCount" INTEGER NOT NULL DEFAULT 0,
    "dailyResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyCap" INTEGER,
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "htmlPath" TEXT NOT NULL,
    "textPath" TEXT,
    "defaultQueue" "EmailQueue" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientRole" "UserRole",
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "queue" "EmailQueue" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "templateData" JSONB,
    "providerConfigId" TEXT,
    "providerKind" "EmailProviderKind",
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "lastErrorCode" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailLogId" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressed_emails" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_terms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "pattern" TEXT,
    "category" "ModerationCategory" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" "ModerationProvider" NOT NULL,
    "status" "ModerationStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "scores" JSONB,
    "categories" "ModerationCategory"[],
    "matchedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flaggedContent" TEXT,
    "reasonText" TEXT,
    "reviewerNote" TEXT,
    "rawResponse" JSONB,
    "cost" DECIMAL(10,6),
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "moderation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_violations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderationResultId" TEXT,
    "category" "ModerationCategory" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "actionType" "ModerationActionType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educator_risk_scores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskLevel" "EducatorRiskLevel" NOT NULL DEFAULT 'LOW',
    "computedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "openViolations" INTEGER NOT NULL DEFAULT 0,
    "highSeverityCount" INTEGER NOT NULL DEFAULT 0,
    "lastViolationAt" TIMESTAMP(3),
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educator_risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_snapshots" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_anomaly_events" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_anomaly_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trigger" "BackupTrigger" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "sizeBytes" BIGINT,
    "targetPath" TEXT,
    "fileName" TEXT,
    "actorId" TEXT,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_promo_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER NOT NULL,
    "scopes" "PlatformPromoScope"[],
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_promo_code_usages" (
    "id" UUID NOT NULL,
    "promoCodeId" UUID NOT NULL,
    "educatorId" TEXT NOT NULL,
    "purchaseType" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_promo_code_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailUnsubscribeToken_key" ON "users"("emailUnsubscribeToken");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_twoFactorEnabled_idx" ON "users"("twoFactorEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_email_key" ON "pending_registrations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_username_key" ON "pending_registrations"("username");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_verificationToken_key" ON "pending_registrations"("verificationToken");

-- CreateIndex
CREATE INDEX "pending_registrations_verificationTokenExpiresAt_idx" ON "pending_registrations"("verificationTokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_types_slug_key" ON "exam_types"("slug");

-- CreateIndex
CREATE INDEX "exam_tests_tenantId_idx" ON "exam_tests"("tenantId");

-- CreateIndex
CREATE INDEX "exam_tests_packageId_idx" ON "exam_tests"("packageId");

-- CreateIndex
CREATE INDEX "exam_tests_publishedAt_idx" ON "exam_tests"("publishedAt");

-- CreateIndex
CREATE INDEX "test_attempts_candidateId_idx" ON "test_attempts"("candidateId");

-- CreateIndex
CREATE INDEX "test_attempts_testId_idx" ON "test_attempts"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "test_attempts_testId_candidateId_key" ON "test_attempts"("testId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "test_stats_testId_key" ON "test_stats"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attemptId_questionId_key" ON "attempt_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "purchases_tenantId_idx" ON "purchases"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_testId_candidateId_key" ON "purchases"("testId", "candidateId");

-- CreateIndex
CREATE INDEX "test_packages_tenantId_idx" ON "test_packages"("tenantId");

-- CreateIndex
CREATE INDEX "test_packages_educatorId_idx" ON "test_packages"("educatorId");

-- CreateIndex
CREATE INDEX "package_views_packageId_createdAt_idx" ON "package_views"("packageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "package_views_viewerId_createdAt_idx" ON "package_views"("viewerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "package_views_packageId_viewerId_idx" ON "package_views"("packageId", "viewerId");

-- CreateIndex
CREATE INDEX "package_views_tenantId_idx" ON "package_views"("tenantId");

-- CreateIndex
CREATE INDEX "follows_followerId_followType_idx" ON "follows"("followerId", "followType");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_educatorId_key" ON "follows"("followerId", "educatorId");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_examTypeId_key" ON "follows"("followerId", "examTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_unsubscribeToken_key" ON "notification_preferences"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_purchaseId_key" ON "refund_requests"("purchaseId");

-- CreateIndex
CREATE INDEX "refund_requests_candidateId_idx" ON "refund_requests"("candidateId");

-- CreateIndex
CREATE INDEX "refund_requests_educatorId_idx" ON "refund_requests"("educatorId");

-- CreateIndex
CREATE INDEX "refund_requests_testId_idx" ON "refund_requests"("testId");

-- CreateIndex
CREATE INDEX "reviews_packageId_idx" ON "reviews"("packageId");

-- CreateIndex
CREATE INDEX "reviews_educatorId_idx" ON "reviews"("educatorId");

-- CreateIndex
CREATE INDEX "reviews_testId_idx" ON "reviews"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_packageId_candidateId_key" ON "reviews"("packageId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_type_version_key" ON "contracts"("type", "version");

-- CreateIndex
CREATE INDEX "contract_acceptances_contractId_idx" ON "contract_acceptances"("contractId");

-- CreateIndex
CREATE INDEX "contract_acceptances_userId_idx" ON "contract_acceptances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_acceptances_userId_contractId_key" ON "contract_acceptances"("userId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_trustToken_key" ON "user_devices"("trustToken");

-- CreateIndex
CREATE INDEX "user_devices_userId_idx" ON "user_devices"("userId");

-- CreateIndex
CREATE INDEX "user_devices_trustToken_idx" ON "user_devices"("trustToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_fingerprint_key" ON "user_devices"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "commission_rate_history_effectiveFrom_idx" ON "commission_rate_history"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ad_purchases_tenantId_idx" ON "ad_purchases"("tenantId");

-- CreateIndex
CREATE INDEX "ad_purchases_educatorId_idx" ON "ad_purchases"("educatorId");

-- CreateIndex
CREATE INDEX "ad_purchases_testId_idx" ON "ad_purchases"("testId");

-- CreateIndex
CREATE INDEX "ad_purchases_validUntil_idx" ON "ad_purchases"("validUntil");

-- CreateIndex
CREATE INDEX "ad_impressions_purchaseId_idx" ON "ad_impressions"("purchaseId");

-- CreateIndex
CREATE INDEX "ad_impressions_educatorId_idx" ON "ad_impressions"("educatorId");

-- CreateIndex
CREATE INDEX "ad_impressions_createdAt_idx" ON "ad_impressions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_providerRef_key" ON "subscriptions"("providerRef");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_kind_subscriberId_idx" ON "subscriptions"("kind", "subscriberId");

-- CreateIndex
CREATE INDEX "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_userId_route_idx" ON "IdempotencyKey"("userId", "route");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_route_key_key" ON "IdempotencyKey"("userId", "route", "key");

-- CreateIndex
CREATE INDEX "webhook_events_receivedAt_idx" ON "webhook_events"("receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEventId_key" ON "webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_joinCode_key" ON "live_sessions"("joinCode");

-- CreateIndex
CREATE INDEX "live_sessions_educatorId_idx" ON "live_sessions"("educatorId");

-- CreateIndex
CREATE INDEX "live_sessions_parentSessionId_idx" ON "live_sessions"("parentSessionId");

-- CreateIndex
CREATE INDEX "live_questions_sessionId_idx" ON "live_questions"("sessionId");

-- CreateIndex
CREATE INDEX "live_options_questionId_idx" ON "live_options"("questionId");

-- CreateIndex
CREATE INDEX "live_participants_sessionId_idx" ON "live_participants"("sessionId");

-- CreateIndex
CREATE INDEX "live_participants_sessionId_lastSeenAt_idx" ON "live_participants"("sessionId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "live_participants_sessionId_join_ip_idx" ON "live_participants"("sessionId", "join_ip");

-- CreateIndex
CREATE UNIQUE INDEX "live_participants_sessionId_userId_key" ON "live_participants"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "live_answers_sessionId_idx" ON "live_answers"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "live_answers_questionId_participantId_key" ON "live_answers"("questionId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_permissions_userId_key" ON "worker_permissions"("userId");

-- CreateIndex
CREATE INDEX "email_provider_configs_tenantId_isActive_priority_idx" ON "email_provider_configs"("tenantId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_key_isActive_idx" ON "email_templates"("tenantId", "key", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_tenantId_key_version_key" ON "email_templates"("tenantId", "key", "version");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_recipientUserId_queuedAt_idx" ON "email_logs"("tenantId", "recipientUserId", "queuedAt");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_status_queuedAt_idx" ON "email_logs"("tenantId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_queue_status_queuedAt_idx" ON "email_logs"("tenantId", "queue", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_templateKey_queuedAt_idx" ON "email_logs"("tenantId", "templateKey", "queuedAt");

-- CreateIndex
CREATE INDEX "email_logs_providerMessageId_idx" ON "email_logs"("providerMessageId");

-- CreateIndex
CREATE INDEX "email_events_tenantId_emailLogId_occurredAt_idx" ON "email_events"("tenantId", "emailLogId", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_tenantId_eventType_occurredAt_idx" ON "email_events"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "suppressed_emails_tenantId_reason_idx" ON "suppressed_emails"("tenantId", "reason");

-- CreateIndex
CREATE INDEX "suppressed_emails_tenantId_expiresAt_idx" ON "suppressed_emails"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppressed_emails_tenantId_email_key" ON "suppressed_emails"("tenantId", "email");

-- CreateIndex
CREATE INDEX "blocked_terms_tenantId_isActive_idx" ON "blocked_terms"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "blocked_terms_tenantId_category_idx" ON "blocked_terms"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_terms_tenantId_term_key" ON "blocked_terms"("tenantId", "term");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_entityType_entityId_idx" ON "moderation_results"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_status_idx" ON "moderation_results"("tenantId", "status");

-- CreateIndex
CREATE INDEX "moderation_results_tenantId_userId_idx" ON "moderation_results"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "moderation_violations_tenantId_userId_createdAt_idx" ON "moderation_violations"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_violations_tenantId_status_severity_createdAt_idx" ON "moderation_violations"("tenantId", "status", "severity", "createdAt");

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

-- CreateIndex
CREATE INDEX "educator_risk_scores_tenantId_lastViolationAt_idx" ON "educator_risk_scores"("tenantId", "lastViolationAt");

-- CreateIndex
CREATE INDEX "draft_snapshots_updatedAt_idx" ON "draft_snapshots"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "draft_snapshots_ownerId_key_key" ON "draft_snapshots"("ownerId", "key");

-- CreateIndex
CREATE INDEX "attempt_anomaly_events_attemptId_type_idx" ON "attempt_anomaly_events"("attemptId", "type");

-- CreateIndex
CREATE INDEX "attempt_anomaly_events_candidateId_createdAt_idx" ON "attempt_anomaly_events"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_logs_tenantId_createdAt_idx" ON "backup_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "backup_logs_tenantId_status_createdAt_idx" ON "backup_logs"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "platform_promo_codes_code_key" ON "platform_promo_codes"("code");

-- CreateIndex
CREATE INDEX "platform_promo_codes_code_idx" ON "platform_promo_codes"("code");

-- CreateIndex
CREATE INDEX "platform_promo_codes_isActive_validUntil_idx" ON "platform_promo_codes"("isActive", "validUntil");

-- CreateIndex
CREATE INDEX "platform_promo_code_usages_educatorId_idx" ON "platform_promo_code_usages"("educatorId");

-- CreateIndex
CREATE INDEX "platform_promo_code_usages_purchaseId_idx" ON "platform_promo_code_usages"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_promo_code_usages_promoCodeId_purchaseId_key" ON "platform_promo_code_usages"("promoCodeId", "purchaseId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_exam_types" ADD CONSTRAINT "topic_exam_types_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_exam_types" ADD CONSTRAINT "topic_exam_types_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "test_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_tests" ADD CONSTRAINT "exam_tests_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_options" ADD CONSTRAINT "exam_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "exam_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "test_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_packages" ADD CONSTRAINT "test_packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_packages" ADD CONSTRAINT "test_packages_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_views" ADD CONSTRAINT "package_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_views" ADD CONSTRAINT "package_views_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "test_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_views" ADD CONSTRAINT "package_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_adminAnswererId_fkey" FOREIGN KEY ("adminAnswererId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_adPackageId_fkey" FOREIGN KEY ("adPackageId") REFERENCES "ad_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_purchases" ADD CONSTRAINT "ad_purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ad_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "live_session_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_questions" ADD CONSTRAINT "live_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_options" ADD CONSTRAINT "live_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "live_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "live_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "live_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "live_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_permissions" ADD CONSTRAINT "worker_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_provider_configs" ADD CONSTRAINT "email_provider_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "email_provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressed_emails" ADD CONSTRAINT "suppressed_emails_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_terms" ADD CONSTRAINT "blocked_terms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educator_risk_scores" ADD CONSTRAINT "educator_risk_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educator_risk_scores" ADD CONSTRAINT "educator_risk_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_snapshots" ADD CONSTRAINT "draft_snapshots_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_anomaly_events" ADD CONSTRAINT "attempt_anomaly_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_anomaly_events" ADD CONSTRAINT "attempt_anomaly_events_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_logs" ADD CONSTRAINT "backup_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_promo_code_usages" ADD CONSTRAINT "platform_promo_code_usages_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "platform_promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

