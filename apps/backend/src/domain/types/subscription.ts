/**
 * Subscription / Tier domain tipleri.
 *
 * Sınav Salonu'nda iki ana abone tipi:
 *   1. EDUCATOR — eğitici aboneliği (test sayısı limiti, komisyon yüzdesi)
 *   2. TENANT  — kurumsal müşteri aboneliği (multi-tenant white-label, kullanıcı limiti)
 *
 * Free / Pro / Enterprise tier'larıyla feature gate altyapısı.
 *
 * İlgili: KALITE-DEGERLENDIRME §14 Ekonomik/İş Değeri.
 */

export type SubscriberKind = 'EDUCATOR' | 'TENANT';

export type SubscriptionTier =
  | 'FREE'
  | 'PRO'
  | 'BUSINESS'
  | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED';

export interface TierLimits {
  maxTests: number | 'unlimited';
  maxQuestionsPerTest: number;
  maxLiveSessionsPerMonth: number;
  maxStudentsPerLiveSession: number;
  commissionPercentage: number;       // Marketplace komisyonu (educator için)
  whiteLabelBranding: boolean;
  customDomain: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
  ssoEnabled: boolean;
  auditLogRetentionDays: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxTests: 3,
    maxQuestionsPerTest: 20,
    maxLiveSessionsPerMonth: 0,
    maxStudentsPerLiveSession: 0,
    commissionPercentage: 20,
    whiteLabelBranding: false,
    customDomain: false,
    prioritySupport: false,
    apiAccess: false,
    ssoEnabled: false,
    auditLogRetentionDays: 30,
  },
  PRO: {
    maxTests: 50,
    maxQuestionsPerTest: 100,
    maxLiveSessionsPerMonth: 10,
    maxStudentsPerLiveSession: 100,
    commissionPercentage: 15,
    whiteLabelBranding: false,
    customDomain: false,
    prioritySupport: true,
    apiAccess: false,
    ssoEnabled: false,
    auditLogRetentionDays: 90,
  },
  BUSINESS: {
    maxTests: 500,
    maxQuestionsPerTest: 200,
    maxLiveSessionsPerMonth: 100,
    maxStudentsPerLiveSession: 500,
    commissionPercentage: 10,
    whiteLabelBranding: true,
    customDomain: true,
    prioritySupport: true,
    apiAccess: true,
    ssoEnabled: false,
    auditLogRetentionDays: 365,
  },
  ENTERPRISE: {
    maxTests: 'unlimited',
    maxQuestionsPerTest: 500,
    maxLiveSessionsPerMonth: 1000,
    maxStudentsPerLiveSession: 5000,
    commissionPercentage: 7.5,
    whiteLabelBranding: true,
    customDomain: true,
    prioritySupport: true,
    apiAccess: true,
    ssoEnabled: true,
    auditLogRetentionDays: 2555, // ~7 yıl
  },
};

export interface SubscriptionRecord {
  id: string;
  kind: SubscriberKind;
  subscriberId: string;        // educatorId veya tenantId
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  /** Stripe Subscription ID. */
  providerRef: string | null;
  /** Stripe Customer ID. */
  customerRef: string | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Feature flag yardımcısı. */
export function tierAllows(
  tier: SubscriptionTier,
  feature: keyof TierLimits,
): boolean | number | 'unlimited' {
  return TIER_LIMITS[tier][feature];
}

/** Quota aşıldı mı? */
export function isOverQuota(
  tier: SubscriptionTier,
  feature: keyof TierLimits,
  currentUsage: number,
): boolean {
  const limit = TIER_LIMITS[tier][feature];
  if (limit === 'unlimited') return false;
  if (typeof limit !== 'number') return false;
  return currentUsage >= limit;
}
