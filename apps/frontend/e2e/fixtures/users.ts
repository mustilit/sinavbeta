/**
 * users.ts — E2E test kullanıcı havuzu (Sprint 17.1 Foundation)
 *
 * Tek doğru kaynak: tüm e2e spec'leri buradaki sabitleri import eder. Yeni rol
 * veya profil gerekirse buraya ekle, `seed-e2e.cjs` otomatik upsert eder.
 *
 * Şifre tüm test kullanıcılarında `demo123` (backend seed DEMO_PASSWORD_HASH).
 *
 * Kategoriler:
 *  - Demo havuzu (backend SeedService de oluşturur): aday / educator / admin
 *  - E2E-spesifik havuz (yalnız seed-e2e.cjs oluşturur): pending/rejected educator,
 *    4 farklı izin profilli worker, ek aday/eğitici (paralel test izolasyonu)
 */

export const E2E_PASSWORD = 'demo123';

export type E2ERole = 'CANDIDATE' | 'EDUCATOR' | 'ADMIN' | 'WORKER';
export type EducatorStatus = 'ACTIVE' | 'PENDING_EDUCATOR_APPROVAL' | 'REJECTED';

export interface E2EUser {
  email: string;
  username: string;
  password: string;
  role: E2ERole;
  /** EDUCATOR için onay durumu — diğer rollerde 'ACTIVE' */
  status?: EducatorStatus | 'ACTIVE';
  /** WORKER için izinli sayfa listesi (routeRoles.js sayfa adları) */
  workerPages?: string[];
  /** EDUCATOR profil metadata (CV, uzmanlık, vb.) — seed wizard alanları */
  metadata?: Record<string, unknown>;
  /** Red sebebi (status=REJECTED ise) */
  rejectionReason?: string;
}

// --- Demo havuzu (backend SeedService ile ortak — geriye dönük) ---

export const DEMO = {
  candidate: {
    email: 'aday@demo.com',
    username: 'demo_aday',
    password: E2E_PASSWORD,
    role: 'CANDIDATE',
    status: 'ACTIVE',
  },
  educator: {
    email: 'educator@demo.com',
    username: 'demo_egitici',
    password: E2E_PASSWORD,
    role: 'EDUCATOR',
    status: 'ACTIVE',
  },
  admin: {
    email: 'admin@demo.com',
    username: 'demo_admin',
    password: E2E_PASSWORD,
    role: 'ADMIN',
    status: 'ACTIVE',
  },
} satisfies Record<string, E2EUser>;

// --- E2E-spesifik havuz (yalnız seed-e2e.cjs oluşturur) ---

/** Onay bekleyen eğitici — sadece /EducatorSettings'e erişebilmeli (B9 kilit) */
export const EDUCATOR_PENDING: E2EUser = {
  email: 'e2e_educator_pending@test.local',
  username: 'e2e_edu_pending',
  password: E2E_PASSWORD,
  role: 'EDUCATOR',
  status: 'PENDING_EDUCATOR_APPROVAL',
  metadata: {
    cv_url: 'http://localhost:3000/uploads/e2e-cv.pdf',
    specialized_exam_types: [],
    education_info: 'E2E Üniversitesi',
    bio: 'Onay bekleyen e2e eğitici',
  },
};

/** Reddedilmiş eğitici — red bildirimi + düzeltme + yeniden başvuru akışı (B9) */
export const EDUCATOR_REJECTED: E2EUser = {
  email: 'e2e_educator_rejected@test.local',
  username: 'e2e_edu_rejected',
  password: E2E_PASSWORD,
  role: 'EDUCATOR',
  status: 'REJECTED',
  rejectionReason: 'CV bilgileri eksik (e2e test sebebi)',
  metadata: {
    cv_url: 'http://localhost:3000/uploads/e2e-cv.pdf',
    specialized_exam_types: [],
    education_info: 'E2E Üniversitesi',
    bio: 'Reddedilmiş e2e eğitici',
  },
};

/** İçerik üretebilen taze eğitici (educator-flow izolasyonu için) */
export const EDUCATOR_FRESH: E2EUser = {
  email: 'e2e_educator_fresh@test.local',
  username: 'e2e_edu_fresh',
  password: E2E_PASSWORD,
  role: 'EDUCATOR',
  status: 'ACTIVE',
};

/** İzole aday (candidate-flow paralel izolasyonu için) */
export const CANDIDATE_FRESH: E2EUser = {
  email: 'e2e_candidate_fresh@test.local',
  username: 'e2e_cand_fresh',
  password: E2E_PASSWORD,
  role: 'CANDIDATE',
  status: 'ACTIVE',
};

/**
 * 4 farklı izin profilli WORKER — permission matrix testleri için.
 * Sayfa adları routeRoles.js PAGE_ROLES anahtarlarıyla birebir.
 */
export const WORKER_USERS: E2EUser[] = [
  {
    email: 'e2e_worker_users@test.local',
    username: 'e2e_worker_users',
    password: E2E_PASSWORD,
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['ManageUsers', 'AdminUserActivity'],
  },
  {
    email: 'e2e_worker_content@test.local',
    username: 'e2e_worker_content',
    password: E2E_PASSWORD,
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['ContentManagement', 'ManageTests'],
  },
  {
    email: 'e2e_worker_finance@test.local',
    username: 'e2e_worker_finance',
    password: E2E_PASSWORD,
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['AdminClaims', 'AdminRevenue', 'ManageRefunds'],
  },
  {
    email: 'e2e_worker_email@test.local',
    username: 'e2e_worker_email',
    password: E2E_PASSWORD,
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['EmailManagement'],
  },
];

/**
 * E-Sınıf (okul) kullanıcıları — seed-e2e.cjs seedSchoolModule() oluşturur.
 * Giriş USERNAME ile (okul kullanıcısı User.role=CANDIDATE'tir); şifre demo123. Okul kodu E2E.
 * school-persona.spec.ts bunlara bağlıdır.
 */
export const SCHOOL_ADMIN = { username: 'E2E-A-0001', password: E2E_PASSWORD, schoolRole: 'SCHOOL_ADMIN' as const };
export const SCHOOL_TEACHER = { username: 'E2E-T-0001', password: E2E_PASSWORD, schoolRole: 'TEACHER' as const };
export const SCHOOL_STUDENT = { username: 'E2E-S-0001', password: E2E_PASSWORD, schoolRole: 'STUDENT' as const };

/** seed-e2e.cjs tarafından upsert edilecek tüm e2e-spesifik kullanıcılar */
export const ALL_E2E_USERS: E2EUser[] = [
  EDUCATOR_PENDING,
  EDUCATOR_REJECTED,
  EDUCATOR_FRESH,
  CANDIDATE_FRESH,
  ...WORKER_USERS,
];

/** Worker'ı izin profiline göre bul (spec'lerde kısayol) */
export function workerByPages(...pages: string[]): E2EUser {
  return (
    WORKER_USERS.find((w) => pages.every((p) => w.workerPages?.includes(p))) ??
    WORKER_USERS[0]
  );
}
