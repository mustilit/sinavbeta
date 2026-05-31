import { devices } from '@playwright/test';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    // UI tamamen Türkçe; i18n LanguageDetector navigator.language'i okur.
    // tr-TR olmazsa EN yüklenir ve TR metin assertion'ları (notices, butonlar)
    // kırılır. localStorage i18nextLng boşken bu fallback'i garantiler.
    locale: 'tr-TR',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
  // TypeScript e2e dosyaları için tsconfig
  tsconfig: './tsconfig.e2e.json',

  // Sprint 11 #5 — 360px viewport + iPhone gerçek touch profili.
  // Mobile-only spec'leri sadece "mobile-*" projelerinde çalıştırıyoruz; geri kalan
  // desktop e2e default project'te (chromium) koşar.
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Galaxy S5 / küçük Android — Türkiye'de en yaygın eşik. 360x640.
      name: 'mobile-360',
      testMatch: /mobile-.*\.spec\.ts/,
      use: {
        ...devices['Galaxy S5'],
        // hasTouch + isMobile zaten devices preset'inde, burada ekstra gerek yok.
      },
    },
    {
      // iPhone 12 — iOS Safari + retina; CSP/font davranışı farklı olabilir.
      name: 'mobile-iphone',
      testMatch: /mobile-.*\.spec\.ts/,
      use: { ...devices['iPhone 12'] },
    },
  ],
};
