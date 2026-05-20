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
  await expect(page.getByRole('heading', { name: /giriş yap/i })).toBeVisible({ timeout: 8000 });

  await page.getByLabel(/e-posta/i).fill(creds.email);
  await page.getByLabel(/şifre/i).fill(creds.password);
  await page.getByRole('button', { name: /giriş yap/i }).click();

  // Yönlendirmeyi bekle — 401 değil başka bir URL olmalı
  await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
    timeout: 15000,
  });
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
export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    await use(page);
    await ctx.close();
  },

  educatorPage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'educator');
    await use(page);
    await ctx.close();
  },

  candidatePage: async ({ browser }, use) => {
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'candidate');
    await use(page);
    await ctx.close();
  },
});

export { expect };
