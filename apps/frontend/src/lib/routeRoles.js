/**
 * Sayfa bazlı rol kontrolü.
 * Her sayfa için: public | [ADMIN, EDUCATOR, CANDIDATE] (boş dizi = sadece giriş yapmış herkes)
 * - public: Giriş gerekmez
 * - CANDIDATE: Aday (My* sayfaları, ProfileSettings, TakeTest, vb.)
 * - EDUCATOR: Eğitici (CreateTest, EducatorDashboard, MyTestPackages, vb.)
 * - ADMIN: Yönetici (Manage*, AdminDashboard, vb.)
 */

export const ROLES = {
  PUBLIC: 'public',
  CANDIDATE: 'CANDIDATE',
  EDUCATOR: 'EDUCATOR',
  ADMIN: 'ADMIN',
  WORKER: 'WORKER',
};

/** Sayfa adı -> bu rollerin erişebileceği (public ise giriş gerekmez) */
export const PAGE_ROLES = {
  Home: [ROLES.PUBLIC],
  Explore: [ROLES.PUBLIC],
  TestDetail: [ROLES.PUBLIC],
  About: [ROLES.PUBLIC],
  Contact: [ROLES.PUBLIC],
  Privacy: [ROLES.PUBLIC],
  Partnership: [ROLES.PUBLIC],
  Pricing: [ROLES.PUBLIC],
  Support: [ROLES.PUBLIC],
  Educators: [ROLES.PUBLIC],
  ExamTypes: [ROLES.PUBLIC],
  EducatorProfile: [ROLES.PUBLIC],
  ForgotPassword: [ROLES.PUBLIC],
  // DeviceVerify: e-postadaki "Cihazı doğrula" linki — public erişim
  DeviceVerify: [ROLES.PUBLIC],
  Login: [ROLES.PUBLIC],
  Register: [ROLES.PUBLIC],
  ResetPassword: [ROLES.PUBLIC],
  // Sprint 14 — Yasal metinler her zaman herkese açık (sözleşme görmek için login gerekmez)
  LegalDocument: [ROLES.PUBLIC],

  MyTests: [ROLES.CANDIDATE],
  MyResults: [ROLES.CANDIDATE],
  // MyTopicReport: Konu bazlı performans raporu — yalnızca adaylar
  MyTopicReport: [ROLES.CANDIDATE],
  // MyObjections: Adayın açtığı hata bildirimleri (salt-okunur izleme)
  MyObjections: [ROLES.CANDIDATE],
  // MyNotes: Adayın kişisel notları (test/konu/sınav türü adresli)
  MyNotes: [ROLES.CANDIDATE],
  // Tünel: eğitici oluşturma/yönetim, admin onay
  CreateTunnel: [ROLES.EDUCATOR, ROLES.ADMIN],
  ManageTunnels: [ROLES.EDUCATOR, ROLES.ADMIN],
  AdminTunnels: [ROLES.ADMIN],
  ProfileSettings: [ROLES.CANDIDATE],
  TakeTest: [ROLES.CANDIDATE],
  CompleteProfile: [ROLES.CANDIDATE],
  SelectExamTypes: [ROLES.CANDIDATE],

  EducatorDashboard: [ROLES.EDUCATOR],
  EducatorOnboarding: [ROLES.EDUCATOR],
  EducatorSettings: [ROLES.EDUCATOR],
  MyTestPackages: [ROLES.EDUCATOR],
  MySales: [ROLES.EDUCATOR],
  // İndirim kodları — eğitici kendi kodlarını, admin tüm kodları yönetir
  MyDiscountCodes: [ROLES.EDUCATOR, ROLES.ADMIN],
  // MyAds: Eğiticinin reklam satın alma ve istatistik sayfası
  MyAds: [ROLES.EDUCATOR],
  QuestionReports: [ROLES.EDUCATOR],
  CreateTest: [ROLES.EDUCATOR],
  EditTest: [ROLES.EDUCATOR],
  EducatorRefunds: [ROLES.EDUCATOR],
  // Canlı test: Educator oturum oluşturur ve yönetir
  MyLiveSessions: [ROLES.EDUCATOR],
  LiveSessionCreate: [ROLES.EDUCATOR],
  LiveSessionHost: [ROLES.EDUCATOR],

  // Canlı test: Aday oturuma katılır
  // Login'siz (misafir) katılım — link/karekod ile. Kayıtlı kullanıcı da JWT ile katılır.
  LiveSessionJoin: [ROLES.PUBLIC],

  // AdminAdReport: Reklam satın alım raporu — yalnızca admin
  AdminAdReport: [ROLES.ADMIN],
  // AdminAdPackages: Reklam paketi CRUD'u — eğiticilere gösterilen "Reklamı Satın Al"
  // dropdown'ı buradan beslenir. Yalnızca admin.
  AdminAdPackages: [ROLES.ADMIN],
  // ManagePackages: Canlı Test + Reklam paketleri tek sayfada iki sekme. Yalnızca admin.
  ManagePackages: [ROLES.ADMIN],
  // AdminUserActivity: Kullanıcı işlem geçmişi görüntüleme (audit log lookup). Yalnızca admin.
  AdminUserActivity: [ROLES.ADMIN],
  AdminCandidateReport: [ROLES.ADMIN],
  AdminCommissionReport: [ROLES.ADMIN],
  AdminSystemControls: [ROLES.ADMIN],
  AdminDashboard: [ROLES.ADMIN],
  AdminEducatorReport: [ROLES.ADMIN],
  ManageExamTypes: [ROLES.ADMIN],
  // Sprint 16 — Sınav Türleri + Soru Konuları birleşik sayfa
  ContentManagement: [ROLES.ADMIN],
  // Sprint 15 — admin platform promo kodu yönetimi
  ManagePromoCodes: [ROLES.ADMIN],
  // Sprint 16 — admin yasal sözleşme yönetimi
  ManageContracts: [ROLES.ADMIN],
  ManageTopics: [ROLES.ADMIN],
  ManageUsers: [ROLES.ADMIN],
  ManageTests: [ROLES.ADMIN],
  ManageRefunds: [ROLES.ADMIN],
  AdminObjections: [ROLES.ADMIN],
  // Talepler — İade Talepleri + Hata Bildirimleri tek sayfada
  AdminClaims: [ROLES.ADMIN],
  // Gelirler — Komisyon + Reklam raporları tek sayfada
  AdminRevenue: [ROLES.ADMIN],
  // Canlı test kapasite paketleri yönetimi — yalnızca admin
  ManageLiveTiers: [ROLES.ADMIN],

  // Email Trafiği yönetimi — yalnızca admin
  EmailDashboard: [ROLES.ADMIN],
  EmailKillSwitches: [ROLES.ADMIN],
  EmailProviders: [ROLES.ADMIN],
  EmailLogs: [ROLES.ADMIN],
  EmailLogDetail: [ROLES.ADMIN],
  EmailTemplates: [ROLES.ADMIN],
  EmailSuppressions: [ROLES.ADMIN],
  // Bildirim tercihleri — auth'lu her kullanıcı (CANDIDATE/EDUCATOR/ADMIN/WORKER)
  EmailPreferences: [ROLES.CANDIDATE, ROLES.EDUCATOR, ROLES.ADMIN, ROLES.WORKER],
  // Public unsubscribe sayfası
  Unsubscribe: [ROLES.PUBLIC],
  // Mail Yönetimi — 6 alt sayfayı sekmelerde toplayan tek sayfa
  EmailManagement: [ROLES.ADMIN],

  // İçerik Moderasyonu — yalnızca admin (WORKER alt yetkilendirmesi mümkün)
  RiskyContent: [ROLES.ADMIN], // birleşik sekmeli sayfa (queue + educators + terms + settings)
  ModerationQueue: [ROLES.ADMIN], // legacy direkt erişim
  RiskyEducators: [ROLES.ADMIN],
  BlockedTerms: [ROLES.ADMIN],
  ModerationResultDetail: [ROLES.ADMIN],
  EducatorViolationDetail: [ROLES.ADMIN],
  ModerationSettings: [ROLES.ADMIN],

  // Eğitici moderasyon durumu — eğitici ve admin
  MyModerationStatus: [ROLES.EDUCATOR, ROLES.ADMIN],

  // Yedekleme Yönetimi — yalnızca admin
  BackupManagement: [ROLES.ADMIN],
};

/** Rolü büyük harfe normalize et (backend bazen küçük harf dönebilir) */
export function normalizeRole(role) {
  return (role || '').toString().toUpperCase();
}

/** Kullanıcı statüsünü büyük harfe normalize et */
export function normalizeStatus(status) {
  return (status || '').toString().toUpperCase();
}

/**
 * Onay aşamasındaki eğitici statüleri (REJECTED veya henüz onaylanmamış).
 * Bu statülerde eğitici sadece EducatorSettings sayfasına erişebilir; başka
 * hiçbir aksiyon (test/paket/canlı oturum oluşturma, satış görüntüleme,
 * mail tercihleri vb.) yapamaz.
 */
const ONBOARDING_EDUCATOR_STATUSES = new Set([
  'REJECTED',
  'PENDING_EDUCATOR_APPROVAL',
]);

/**
 * Onay aşamasındaki eğiticinin yalnızca girebileceği sayfa(lar).
 * EducatorSettings = red bildirimi + profil düzenle + "Yeniden Başvur" akışı.
 * Diğer her şey (Dashboard, MyTests, Settings, MyModerationStatus, mail
 * tercihleri…) onay sonrasına bırakılır.
 */
export const ONBOARDING_EDUCATOR_ALLOWED_PAGES = new Set([
  'EducatorSettings',
]);

/** Geriye dönük uyumluluk için eski ad — REJECTED kapsamını korur. */
export const REJECTED_EDUCATOR_ALLOWED_PAGES = ONBOARDING_EDUCATOR_ALLOWED_PAGES;

/** Aktif bir eğitici hesabı sayılan statüler */
const ACTIVE_EDUCATOR_STATUSES = new Set(['ACTIVE', 'APPROVED']);

/**
 * Kullanıcı bu sayfaya erişebilir mi?
 * @param {string} pageName - Sayfa anahtarı (örn. 'MyResults')
 * @param {{ role?: string, status?: string } | null} user - Giriş yapmış kullanıcı veya null
 */
export function canAccessPage(pageName, user) {
  const roles = PAGE_ROLES[pageName];
  if (!roles || roles.includes(ROLES.PUBLIC)) return true;
  if (!user) return false;
  const r = normalizeRole(user.role);
  const status = normalizeStatus(user.status);

  // Onay aşamasındaki eğitici (REJECTED veya PENDING_EDUCATOR_APPROVAL):
  // SADECE EducatorSettings — başka hiçbir sayfa.
  if (r === ROLES.EDUCATOR && ONBOARDING_EDUCATOR_STATUSES.has(status)) {
    return ONBOARDING_EDUCATOR_ALLOWED_PAGES.has(pageName);
  }

  if (r === ROLES.ADMIN) return true;
  // Worker: yalnızca kendisine atanan sayfalar
  if (r === ROLES.WORKER) {
    return Array.isArray(user.workerPages) && user.workerPages.includes(pageName);
  }
  if (roles.includes(r)) return true;
  return false;
}

/**
 * Rol için ana sayfa (giriş sonrası yönlendirme)
 */
export function getHomeForRole(role, user) {
  const r = normalizeRole(role);
  const status = normalizeStatus(user?.status);
  // Onay aşamasındaki eğitici doğrudan EducatorSettings'e iner
  if (r === ROLES.EDUCATOR && ONBOARDING_EDUCATOR_STATUSES.has(status)) {
    return 'EducatorSettings';
  }
  if (r === ROLES.ADMIN) return 'AdminDashboard';
  if (r === ROLES.EDUCATOR) {
    // Bilinmeyen statüler de güvenli tarafta — Settings'e
    if (status && !ACTIVE_EDUCATOR_STATUSES.has(status)) return 'EducatorSettings';
    return 'EducatorDashboard';
  }
  if (r === ROLES.WORKER) {
    // Worker için ilk izin verilen sayfayı döndür
    const pages = Array.isArray(user?.workerPages) ? user.workerPages : [];
    return pages[0] ?? 'AdminDashboard';
  }
  return 'Explore';
}

/**
 * Kullanıcı reddedilmiş bir eğitici mi? (UI'da banner / sidebar filtresi vb.)
 */
export function isRejectedEducator(user) {
  return (
    normalizeRole(user?.role) === ROLES.EDUCATOR &&
    normalizeStatus(user?.status) === 'REJECTED'
  );
}

/**
 * Eğitici onay aşamasında mı? (REJECTED veya henüz onaylanmamış)
 * UI/Sidebar filtreleme ve "tek sayfaya kilitleme" mantığı için.
 */
export function isOnboardingEducator(user) {
  return (
    normalizeRole(user?.role) === ROLES.EDUCATOR &&
    ONBOARDING_EDUCATOR_STATUSES.has(normalizeStatus(user?.status))
  );
}

/** Giriş/kayıt sayfaları - sidebar yok, giriş yapmışsa ana sayfaya yönlendirilir */
export const AUTH_PAGES = ['Login', 'Register', 'VerifyEmail', 'ForgotPassword', 'ResetPassword'];

/** Sayfa korumalı mı (giriş gerekli) */
export function isProtectedPage(pageName) {
  const roles = PAGE_ROLES[pageName];
  if (!roles || roles.includes(ROLES.PUBLIC)) return false;
  return true;
}
