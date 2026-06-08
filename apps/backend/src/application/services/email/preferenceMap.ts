/**
 * Email kullanıcı tercihleri JSON şeması.
 * User.emailPreferences alanı bu formatı tutar.
 */
export type EmailPreferences = {
  marketing: boolean;            // kampanya/duyuru
  productUpdates: boolean;       // yeni özellik duyurusu
  weeklyDigest: boolean;         // haftalık özet
  reviewNotifications: boolean;  // değerlendirme bildirimi
  objectionUpdates: boolean;     // itiraz güncellemesi
  liveSessionInvites: boolean;   // canlı sınav daveti
  refundUpdates: boolean;        // iade durum bildirimi (NOTIFY)
};

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  marketing: false,
  productUpdates: true,
  weeklyDigest: true,
  reviewNotifications: true,
  objectionUpdates: true,
  liveSessionInvites: true,
  refundUpdates: true,
};

/**
 * Template key → preference field eşlemesi.
 * `null` → preference filtresi uygulanmaz (CRITICAL şablonlar her zaman gider).
 */
export const PREFERENCE_MAP: Record<string, keyof EmailPreferences | null> = {
  // CRITICAL — kullanıcı kapatamaz
  'password-reset': null,
  'email-verification': null,
  'purchase-receipt': null,
  'refund-confirmation': null,
  'account-security-alert': null,
  'educator-moderation-action': null,
  'backup-failure-alert': null,
  // NOTIFY
  'review-received': 'reviewNotifications',
  'objection-update': 'objectionUpdates',
  'live-session-invite': 'liveSessionInvites',
  'refund-status-update': 'refundUpdates',
  'refund-rejected': 'refundUpdates',
  'inactive-reminder': 'productUpdates', // pasif kullanıcı hatırlatması — opt-out edilebilir
  // BULK
  'weekly-digest': 'weeklyDigest',
  'campaign-announcement': 'marketing',
  'product-update': 'productUpdates',
  // Test
  'test-template': null,
};

/**
 * Mevcut JSON'u parse ederek default ile birleştirir — eksik alanlar default değer alır.
 */
export function readEmailPreferences(raw: unknown): EmailPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EMAIL_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const out: EmailPreferences = { ...DEFAULT_EMAIL_PREFERENCES };
  (Object.keys(DEFAULT_EMAIL_PREFERENCES) as Array<keyof EmailPreferences>).forEach((k) => {
    if (typeof obj[k] === 'boolean') out[k] = obj[k] as boolean;
  });
  return out;
}
