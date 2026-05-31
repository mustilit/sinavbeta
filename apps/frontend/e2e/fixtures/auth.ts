/**
 * auth.ts — Playwright kimlik doğrulama helper'ları
 *
 * Demo credential'lar Login sayfasında gösterilir:
 *   aday@demo.com / demo123        → CANDIDATE
 *   educator@demo.com / demo123    → EDUCATOR
 *   admin@demo.com / demo123       → ADMIN
 *
 * Eğer admin demo credential'ı farklıysa ADMIN_EMAIL / ADMIN_PASSWORD
 * ortam değişkenlerinden okunur.
 */
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import type { E2EUser } from './users';
import { E2E_PASSWORD } from './users';

// Demo credential'lar — staging seed'e göre
const DEMO_CREDENTIALS = {
  candidate: {
    email: process.env.CANDIDATE_EMAIL ?? 'aday@demo.com',
    password: process.env.CANDIDATE_PASSWORD ?? 'demo123',
  },
  educator: {
    email: process.env.EDUCATOR_EMAIL ?? 'educator@demo.com',
    password: process.env.EDUCATOR_PASSWORD ?? 'demo123',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@demo.com',
    password: process.env.ADMIN_PASSWORD ?? 'demo123',
  },
} as const;

/**
 * Login sayfası üzerinden form tabanlı giriş.
 * Başarılı girişte / veya /AdminDashboard'a yönlendiğini bekler.
 */
export async function loginAs(
  page: Page,
  role: 'candidate' | 'educator' | 'admin',
): Promise<void> {
  const creds = DEMO_CREDENTIALS[role];
  await page.goto('/Login');
  // Heading dil/i18n koşusuna duyarlı — onun yerine email input'unu bekle
  const emailInput = page.getByLabel(/e-?(posta|mail)/i).first();
  await expect(emailInput).toBeVisible({ timeout: 15000 });

  await emailInput.fill(creds.email);
  await page.getByLabel(/şifre|password/i).first().fill(creds.password);
  await page.getByRole('button', { name: /giriş yap|sign in|log in/i }).first().click();

  // Yönlendirmeyi bekle — 401 değil başka bir URL olmalı
  await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
    timeout: 15000,
  });

  // Çerez consent dialog'u testleri bloklar — varsa kabul et
  const cookieAccept = page.getByRole('button', { name: /kabul et|accept|tümüne izin/i }).first();
  if (await cookieAccept.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieAccept.click();
  }
}

/**
 * Generic credential login (Sprint 17.1) — e2e user pool veya ad-hoc kullanıcı.
 * loginAs'in role-bağımsız versiyonu; worker ve e2e-spesifik kullanıcılar için.
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/Login');
  const emailInput = page.getByLabel(/e-?(posta|mail)/i).first();
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill(email);
  await page.getByLabel(/şifre|password/i).first().fill(password);
  await page.getByRole('button', { name: /giriş yap|sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
    timeout: 15000,
  });
  const cookieAccept = page.getByRole('button', { name: /kabul et|accept|tümüne izin/i }).first();
  if (await cookieAccept.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieAccept.click();
  }
}

/**
 * E2E user pool nesnesiyle login (users.ts). Worker/pending/rejected dahil.
 * REJECTED/PENDING eğitici login'i başarılı olur ama EducatorSettings'e kilitlenir;
 * waitForURL /login dışına çıkmayı bekler — bu durumda da geçerli.
 */
export async function loginAsUser(page: Page, user: E2EUser): Promise<void> {
  return loginWithCredentials(page, user.email, user.password);
}

/**
 * Admin olarak giriş yap ve sayfayı döndür.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  return loginAs(page, 'admin');
}

/**
 * Educator olarak giriş yap ve sayfayı döndür.
 */
export async function loginAsEducator(page: Page): Promise<void> {
  return loginAs(page, 'educator');
}

/**
 * Candidate olarak giriş yap ve sayfayı döndür.
 */
export async function loginAsCandidate(page: Page): Promise<void> {
  return loginAs(page, 'candidate');
}

// --- Fixture tipleri ---
type AuthFixtures = {
  adminPage: Page;
  educatorPage: Page;
  candidatePage: Page;
};

/**
 * Playwright fixture uzantısı — adminPage, educatorPage, candidatePage
 * Her test kendi browser context'ini alır (state izolasyonu).
 */
/** Çerez consent + onboarding tour overlay'lerini suppress et + TR locale.
    Playwright varsayılan 'en-US' kullanır; i18n LanguageDetector EN seçer ve
    testlerin TR text aramaları başarısız olur. localStorage.i18nextLng='tr' set ederiz. */
async function suppressOverlays(ctx: BrowserContext) {
  // baseURL üzerinden initial storage yazımı için bir page açıp set ediyoruz
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.setItem('analytics_consent', 'granted');
      localStorage.setItem('i18nextLng', 'tr');
      // Onboarding tour'larını da "tamamlandı" olarak işaretle
      sessionStorage.setItem('dal_completed_tours', JSON.stringify({
        ob_cand_welcome: true,
        ob_cand_test: true,
        ob_edu_welcome: true,
        ob_edu_create: true,
      }));
    } catch { /* ignore */ }
  });
  await page.close();
}

/**
 * Her sayfaya navigasyondan ÖNCE i18n dilini TR'ye + consent'i granted'a sabitler.
 * LanguageDetector öncelik sırası localStorage > navigator; `locale: 'tr-TR'`
 * config'i tek başına yetmiyor (tr-TR → tr map'i yok, EN'e düşüyor). addInitScript
 * localStorage'ı her load'dan önce set ettiği için garantili TR sağlar.
 */
async function injectTrLocale(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('i18nextLng', 'tr');
      localStorage.setItem('analytics_consent', 'granted');
      sessionStorage.setItem(
        'dal_completed_tours',
        JSON.stringify({
          ob_cand_welcome: true,
          ob_cand_test: true,
          ob_edu_welcome: true,
          ob_edu_create: true,
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

export const test = base.extend<AuthFixtures>({
  // Base `page` fixture override — tüm spec'ler (foundation, educator-*, vb.)
  // otomatik TR locale + consent + tour-suppressed başlar.
  page: async ({ page }, use) => {
    await injectTrLocale(page);
    await use(page);
  },

  adminPage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    await suppressOverlays(ctx);
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await use(page);
    await ctx.close();
  },

  educatorPage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    await suppressOverlays(ctx);
    const page = await ctx.newPage();
    await loginAs(page, 'educator');
    await use(page);
    await ctx.close();
  },

  candidatePage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    await suppressOverlays(ctx);
    const page = await ctx.newPage();
    await loginAs(page, 'candidate');
    await use(page);
    await ctx.close();
  },
});

export { expect };
