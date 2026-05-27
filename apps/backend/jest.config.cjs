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
    // Global baseline — 27 May 2026 (sprint 3 sonu, 53 yeni test dosyası, 487 test case).
    //   Önceki: stmts %9.51 (24 May) → Şimdi: stmts %35.2.
    // Threshold = ölçüm - 2 pt (CI dalgalanma toleransı). Ratchet workflow ile artırılır.
    global: {
      branches: 24,
      functions: 27,
      lines: 33,
      statements: 33,
    },
    // Use-cases katmanı (toplam): sprint 1: %22 → sprint 3: %51.
    // Hot path domain'ler %85+'a ulaştı (billing, refund); diğerleri sprint 4'te.
    './src/application/use-cases/': {
      branches: 37,
      functions: 39,
      lines: 50,
      statements: 48,
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
    // Refund (5 aşamalı state machine): %85.6 stmts. Audit + escalation kritik.
    './src/application/use-cases/refund/': {
      statements: 80,
      branches: 70,
      functions: 60,
      lines: 82,
    },
    // Auth (2FA, login, device verification): %65.4 stmts. Hedef %85 sprint 4'te.
    './src/application/use-cases/auth/': {
      statements: 62,
      branches: 46,
      functions: 65,
      lines: 62,
    },
    // Attempt (test çözme akışı — overtime, finish, snapshot): %68.9 stmts.
    './src/application/use-cases/attempt/': {
      statements: 65,
      branches: 53,
      functions: 65,
      lines: 67,
    },
    // Services (AuditLogger, ReviewAggregation, Email): %41.1 stmts.
    './src/application/services/': {
      statements: 38,
      branches: 25,
      functions: 38,
      lines: 39,
    },
    // Security (webhook signature + CSP builder): %95.2 stmts — para + tarayıcı güvenliği.
    // Bu klasör düşmeye ASLA izin verilmez; hata = production security regression.
    './src/nest/security/': {
      statements: 92,
      branches: 86,
      functions: 95,
      lines: 92,
    },
    // Guards (Roles + WorkerPermissions + Captcha): %33.9 stmts.
    './src/nest/guards/': {
      statements: 31,
      branches: 23,
      functions: 50,
      lines: 30,
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
    // Repositories (Prisma katmanı): %23.7 stmts. Mock-heavy, sprint 4'te yükselt.
    './src/infrastructure/repositories/': {
      statements: 21,
      branches: 20,
      functions: 22,
      lines: 22,
    },
    // Common (tenant context + rate-limit util): %25.4 stmts.
    // TODO: common/rate-limit.ts testi eksik (test edilirse %85+'a döner). Sprint 4.
    './src/common/': {
      statements: 23,
      branches: 13,
      functions: 47,
      lines: 18,
    },
    // Domain (saf entity validation): hâlâ test yok; sprint 4'te eklenecek.
    // './src/domain/': { branches: 85, functions: 90, lines: 90, statements: 90 },
  },
};

