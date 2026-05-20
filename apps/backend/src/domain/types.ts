export type UserStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'DELETED'
  | 'SUSPENDED'
  | 'PENDING_EDUCATOR_APPROVAL';

export type UserRole = 'ADMIN' | 'EDUCATOR' | 'CANDIDATE' | 'WORKER';

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'TIMEOUT';

export type TestStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export type PurchaseStatus = 'ACTIVE' | 'REFUNDED' | 'EXPIRED';

export type ReviewStatus = 'pending' | 'in_progress' | 'completed';

export type ObjectionStatus = 'OPEN' | 'ANSWERED' | 'ESCALATED';

export type ContractType = 'CANDIDATE' | 'EDUCATOR';

export type Severity = 'info' | 'warning' | 'error';

export type SuggestionCategory =
  | 'performance'
  | 'security'
  | 'readability'
  | 'best_practice'
  | 'refactoring';

/** Çekirdek aksiyonlar: Prisma AuditAction enum + uygulama tarafı alias'ları (DB'ye yazarken map edilir) */
export type AuditAction =
  | 'PURCHASE'
  | 'SUBMIT_ANSWER'
  | 'SUBMIT_ATTEMPT'
  | 'TEST_PUBLISHED'
  | 'TEST_UNPUBLISHED'
  | 'PRICE_CHANGED'
  | 'PRICE_CHANGE'
  | 'REFUND'
  | 'REFUND_REQUESTED'
  | 'REFUND_RESOLVED'
  | 'REFUND_APPROVED'
  | 'REFUND_REJECTED'
  | 'OBJECTION_CREATED'
  | 'OBJECTION_ANSWERED'
  | 'DISCOUNT_CREATED'
  | 'REVIEW_CREATED'
  | 'EDUCATOR_APPROVED'
  | 'EDUCATOR_SUSPENDED'
  | 'EDUCATOR_UNSUSPENDED'
  | 'PUBLISH'
  | 'UNPUBLISH';

/** Uygulama genişletmeleri; DB'ye yazarken Prisma enum ile eşleşmeyenler map edilir */
export type ExtendedAuditAction =
  | AuditAction
  | 'NOTIFICATIONS_DISABLED'
  | 'EMAIL_SENT'
  | 'OBJECTION_ESCALATED'
  | 'EMAIL_FAILED'
  | 'SUSPICIOUS_RATE_LIMIT'
  | 'CSP_VIOLATION'
  | 'EXAMTYPE_CREATED'
  | 'TOPIC_CREATED'
  | 'CONTRACT_ACCEPTED'
  | 'EDUCATOR_PROFILE_UPDATED'
  | 'EXAMTYPE_UPDATED'
  | 'EXAMTYPE_DELETED'
  | 'TOPIC_UPDATED'
  | 'TOPIC_DELETED';

export type Money = {
  cents: number;
  currency: string;
};

export type DiscountCode = {
  id: string;
  code: string;
  percentOff: number; // 0-100
  maxUses?: number | null;
  usedCount: number;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type AdminSettings = {
  commissionPercent: number;
  vatPercent: number;
  // Kill switch'ler — false yapıldığında ilgili işlem anında engellenir
  purchasesEnabled: boolean;
  packageCreationEnabled: boolean;
  testPublishingEnabled: boolean;
  testAttemptsEnabled: boolean;
  /** Eğitici reklam satın alma kill-switch'i */
  adPurchasesEnabled: boolean;
  /** 2FA sistem geneli aç/kapat. false iken hiçbir kullanıcı 2FA aktif edemez. */
  twoFactorSystemEnabled: boolean;
  /** Minimum paket fiyatı (kuruş). Eğitici bu değerin altında fiyat giremez. */
  minPackagePriceCents: number;
  /** Test başına minimum soru sayısı. Yayımlamada kontrol edilir. */
  minQuestionsPerTest: number;
  /** Test başına maksimum soru sayısı. Soru eklerken kontrol edilir. */
  maxQuestionsPerTest: number;
  /** Paket başına maksimum test sayısı. Pakete test eklerken kontrol edilir. */
  maxTestsPerPackage: number;
  /** Canlı oturum başına maksimum soru sayısı. Oturum oluştururken kontrol edilir. */
  maxLiveQuestions: number;
};

export type SiteSettings = {
  siteName: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  searchPlaceholder: string | null;
  statTests: string | null;
  statEducators: string | null;
  statCandidates: string | null;
  statSuccessRate: string | null;
  footerDescription: string | null;
  companyName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  linkAbout: string | null;
  linkPrivacy: string | null;
  linkContact: string | null;
  linkPartnership: string | null;
  linkSupport: string | null;
  copyrightText: string | null;
};

