/**
 * İçerik Moderasyonu — Türkçe etiketleri ve stil sabitleri
 */

export const CATEGORY_LABELS_TR = {
  HATE_SPEECH: 'Nefret Söylemi',
  VIOLENCE: 'Şiddet',
  SEXUAL_CONTENT: 'Müstehcen',
  SELF_HARM: 'Öz Zarar',
  HARASSMENT: 'Taciz',
  ILLEGAL: 'Yasadışı',
  PROFANITY: 'Küfür',
  SPAM: 'Spam',
  MISINFORMATION: 'Yanlış Bilgi',
  PERSONAL_DATA: 'Kişisel Veri',
  COPYRIGHT: 'Telif',
  OTHER: 'Diğer',
};

export const RISK_LEVEL_LABELS_TR = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

export const ACTION_TYPE_LABELS_TR = {
  WARN: 'Uyarı',
  CONTENT_REMOVED: 'İçerik Kaldırıldı',
  ACCOUNT_SUSPENDED: 'Hesap Askıya Alındı',
  ACCOUNT_BANNED: 'Hesap Yasaklandı',
  ESCALATED_TO_ADMIN: 'Yönetime İletildi',
};

export const MODERATION_STATUS_LABELS_TR = {
  PENDING_REVIEW: 'İnceleme Bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  ESCALATED: 'Yönetime İletildi',
};

export const PROVIDER_LABELS_TR = {
  CLAUDE: 'Claude AI',
  RULE_BASED: 'Kural Tabanlı',
  MANUAL: 'Manuel',
};

/**
 * Risk seviyesi için Tailwind class'ları (light + dark)
 */
export const RISK_LEVEL_COLORS = {
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  CRITICAL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

/**
 * Kategori için Tailwind class'ları
 */
export const CATEGORY_COLORS = {
  HATE_SPEECH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  VIOLENCE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  SEXUAL_CONTENT: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  SELF_HARM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  HARASSMENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  ILLEGAL: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  PROFANITY: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  SPAM: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  MISINFORMATION: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  PERSONAL_DATA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  COPYRIGHT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

/**
 * Moderation status badge renkleri
 */
export const MODERATION_STATUS_COLORS = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  ESCALATED: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};
