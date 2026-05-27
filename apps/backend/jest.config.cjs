// Jest configuration — Sınav Salonu backend
//
// Coverage threshold disiplini (KALITE-DEGERLENDIRME §11 — Test Kalitesi):
//   - Global baseline: bugünkü dağılım üzerinde (statements/lines %35, branches %25,
//     functions %30). PR'da düşme kabul edilmez; çeyrek sonunda +%5 hedef.
//   - Use case katmanı: %85 hedef (henüz baseline değil, kademeli sıkılaştırılacak —
//     başlangıçta global ile aynı, refactor sonrası `coverageThreshold` içinden
//     yorum kaldırılır).
//   - Domain saf kod: %95 hedef (aynı).
//
// Çalıştırma:
//   npm test                          → tüm test'ler, coverage kapalı
//   npm test -- --coverage            → tek seferlik coverage raporu (text + lcov + html)
//   npm run test:unit:ci              → CI: --runInBand --coverage --coverageDirectory=./coverage
//
// Codecov: lcov.info ./coverage altına düşüyor; .github/workflows üzerinden yüklenir.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testTimeout: 20000,
  verbose: true,
  testMatch: ['**/tests/**/*.test.(js|ts)'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.stryker-tmp/'],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.stryker-tmp/'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: './test-reports', outputName: 'junit.xml' }],
  ],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/main.ts',
    '!src/index.ts',
    '!src/instrument.ts',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'json-summary', 'html'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/prisma/', '/scripts/'],
  // Threshold disiplini:
  //   Bugünkü baseline ile başla; PR'da düşmesin. Her sprint hedefe doğru sıkıştır.
  //   Path-spesifik threshold'lar (use-cases, guards) aktarılmadan önce
  //   o klasördeki test coverage'ı baseline'a ulaşmalı; yoksa CI sürekli kırmızı kalır.
  coverageThreshold: {
    // Global baseline — 27 May 2026 (sprint 4 sonu, 144 yeni test dosyası, ~990 test case).
    //   Sprint 0: %9.51 (24 May) → Sprint 3: %35.2 → Sprint 4: %55.8.
    // Threshold = ölçüm - 2 pt (CI dalgalanma toleransı). Ratchet workflow ile artırılır.
    global: {
      branches: 46,
      functions: 53,
      lines: 60,
      statements: 59,
    },
    // Use-cases katmanı (toplam): sprint 1: %22 → sprint 3: %51 → sprint 4: %64.
    // admin/moderation/live derinleştirildi; controllers + common dahil edildi.
    './src/application/use-cases/': {
      branches: 56,
      functions: 66,
      lines: 75,
      statements: 73,
    },

    // ── Path-spesifik %85+ HEDEF olan modüller (KALITE-DEGERLENDIRME §11) ────
    // Bu modüller hot-path veya güvenlik-kritik; ölçüm yüksek baseline'a ulaştığı
    // için sıkı threshold ile dondurulur. Düşmeye CI izin vermez.

    // Billing (Stripe + Iyzico): %92.7 stmts — webhook signature, idempotency, replay
    // koruması. Hata bütçesi minimum (para akışı).
    './src/application/use-cases/billing/': {
      statements: 88,
      branches: 72,
      functions: 90,
      lines: 90,
    },
    // Refund: sprint 4 ölçüm %87.8 stmts (sprint 3'te %85.6'dı).
    './src/application/use-cases/refund/': {
      statements: 82,
      branches: 70,
      functions: 62,
      lines: 85,
    },
    // Auth (2FA, login, device verification): sprint 5 ölçüm %65.4 stmts.
    './src/application/use-cases/auth/': {
      statements: 62,
      branches: 46,
      functions: 65,
      lines: 62,
    },
    // Attempt (test çözme akışı — overtime, snapshot, resume): sprint 5 ölçüm
    // %86.3 stmts (sprint 4'te %68.9'du; agent attempt domain'ini derinleştirdi).
    './src/application/use-cases/attempt/': {
      statements: 83,
      branches: 70,
      functions: 80,
      lines: 83,
    },
    // Admin (admin paneli use-case'leri): sprint 5 ölçüm %67.1 stmts.
    './src/application/use-cases/admin/': {
      statements: 63,
      branches: 38,
      functions: 47,
      lines: 62,
    },
    // Moderation (AI içerik koruması): sprint 5 ölçüm %83.7 stmts.
    './src/application/use-cases/moderation/': {
      statements: 80,
      branches: 55,
      functions: 70,
      lines: 80,
    },
    // Live session: sprint 5 ölçüm %83.7 stmts (sprint 4'te %61'di; +22pt).
    './src/application/use-cases/live/': {
      statements: 80,
      branches: 73,
      functions: 60,
      lines: 82,
    },
    // Email use-cases: sprint 5 ölçüm %75.5 stmts (sprint 4'te %30.2'ydi; +45pt).
    './src/application/use-cases/email/': {
      statements: 72,
      branches: 56,
      functions: 78,
      lines: 76,
    },
    // Purchase use-cases: sprint 5 ölçüm %75.4 stmts (sprint 4'te %25'di; +50pt).
    './src/application/use-cases/purchase/': {
      statements: 72,
      branches: 65,
      functions: 70,
      lines: 72,
    },
    // Services (AuditLogger, ReviewAggregation, Email): %43.8 stmts.
    './src/application/services/': {
      statements: 40,
      branches: 27,
      functions: 40,
      lines: 41,
    },
    // Security (webhook signature + CSP builder): %95.2 stmts — para + tarayıcı güvenliği.
    // Bu klasör düşmeye ASLA izin verilmez; hata = production security regression.
    './src/nest/security/': {
      statements: 92,
      branches: 86,
      functions: 95,
      lines: 92,
    },
    // Controllers (sprint 4 ölçüm %87.6 stmts — 58 yeni test dosyası).
    // Hedef %95'e çıkarmak için sprint 5'te az kalan dosyalar tamamlanacak.
    './src/nest/controllers/': {
      statements: 85,
      branches: 64,
      functions: 87,
      lines: 85,
    },
    // Guards (Roles + WorkerPermissions + Captcha + Tier + Origin): %61.6 stmts.
    './src/nest/guards/': {
      statements: 58,
      branches: 44,
      functions: 60,
      lines: 56,
    },
    // Interceptors (idempotency + metrics): %85.4 stmts — para akışı + telemetri.
    './src/nest/interceptors/': {
      statements: 83,
      branches: 55,
      functions: 70,
      lines: 83,
    },
    // Metrics (prom-client registry): %90 stmts.
    './src/infrastructure/metrics/': {
      statements: 87,
      branches: 0,
      functions: 0,
      lines: 86,
    },
    // Repositories (Prisma katmanı): sprint 4 ölçüm %30.7 stmts (sprint 3'te %23.7'di).
    './src/infrastructure/repositories/': {
      statements: 28,
      branches: 28,
      functions: 28,
      lines: 30,
    },
    // Common (tenant + rate-limit + utils): sprint 4 ölçüm %76.3 stmts
    // (sprint 3'te %25.4'tü; rate-limit testi eklendi). %85'e ulaşmak için
    // 1-2 dosya daha test edilebilir.
    './src/common/': {
      statements: 73,
      branches: 48,
      functions: 95,
      lines: 70,
    },
    // Domain (saf utility'ler + entity): sprint 5 ölçüm %57.9 stmts (sprint 4'te
    // %21.1'di; agent 3 yeni domain test ekledi: bankerRound, AppErrorHierarchy,
    // ensureEducatorActive). Placeholder dosyalar nedeniyle %85'e zor ulaşır.
    './src/domain/': {
      statements: 55,
      branches: 56,
      functions: 30,
      lines: 60,
    },
  },
};

