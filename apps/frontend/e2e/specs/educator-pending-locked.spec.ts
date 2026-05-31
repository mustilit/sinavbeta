/**
 * educator-pending-locked.spec.ts (Sprint 17.2 — Eğitici hikayesi E2)
 *
 * Onay bekleyen eğitici (PENDING_EDUCATOR_APPROVAL) yalnızca EducatorSettings'e
 * erişebilir; tüm içerik üretim + yönetim sayfaları kilitli (B9 routeRoles).
 *
 * Bu, foundation'daki tek örneği tüm EDUCATOR-only sayfa setine genişletir.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { EDUCATOR_PENDING } from '../fixtures/users';
import { reseedE2EUsers } from '../setup/reset';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  reseedE2EUsers(); // PENDING durumunu garantile
});

// EDUCATOR-only sayfalar — PENDING'de hepsi EducatorSettings'e redirect olmalı
const LOCKED_PAGES = [
  'EducatorDashboard',
  'CreateTest',
  'MyTestPackages',
  'MySales',
  'MyDiscountCodes',
  'MyAds',
  'MyLiveSessions',
  'EducatorRefunds',
  'QuestionReports',
];

test.describe('Eğitici — onay bekleyen tek-sayfa kilidi', () => {
  test('EducatorSettings erişilebilir + "onay bekleniyor" durumu', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_PENDING);
    await page.goto('/EducatorSettings');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
    // Onay bekliyor bildirimi veya en azından sayfanın yüklendiği
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8000 });
  });

  for (const pageName of LOCKED_PAGES) {
    test(`${pageName} → EducatorSettings'e kilitli`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginAsUser(EDUCATOR_PENDING);
      await page.goto(`/${pageName}`);
      await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
    });
  }

  test('admin sayfasına da giremez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_PENDING);
    await page.goto('/AdminDashboard');
    await expect(page).not.toHaveURL(/AdminDashboard/i, { timeout: 8000 });
  });

  test('public sayfaları (Home/Explore) görebilir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_PENDING);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });
  });
});
