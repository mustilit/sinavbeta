/**
 * admin-access.spec.ts (Sprint 17.5 — Admin erişim + sayfa yükleme)
 *
 * Admin tüm yönetim sayfalarına erişebilir + sayfalar crash etmeden yüklenir.
 * "Her ekran açılıyor mu" hedefinin admin kısmı (navigation + smoke).
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

const ADMIN_PAGES = [
  'AdminDashboard',
  'ManageUsers',
  'ManageTests',
  'ContentManagement',
  'AdminClaims',
  'AdminRevenue',
  'AdminSystemControls',
  'ManagePackages',
  'EmailManagement',
  'RiskyContent',
  'ManageContracts',
  'BackupManagement',
  'AdminUserActivity',
];

test.describe('Admin — tüm yönetim sayfalarına erişim + smoke', () => {
  for (const pageName of ADMIN_PAGES) {
    test(`${pageName} erişilebilir + crash yok`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginAsUser(DEMO.admin);
      await page.goto(`/${pageName}`);
      // Sayfa adına yönlenmeli (redirect/403 yok)
      await expect(page).toHaveURL(new RegExp(pageName, 'i'), { timeout: 10000 });
      // En az bir başlık render olmalı (boş/crash değil)
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8000 });
    });
  }
});
