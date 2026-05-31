/**
 * worker-login-restricted.spec.ts (Sprint 17.5 — Worker erişim matrisi)
 *
 * WORKER = ADMIN alt-yetki bölümlemesi. Her worker yalnızca kendisine atanan
 * sayfalara erişir; diğer admin sayfaları + EDUCATOR/CANDIDATE sayfaları kilitli.
 *
 * seed-e2e.cjs 4 izin profili kurar:
 *  - users:   ManageUsers, AdminUserActivity
 *  - content: ContentManagement, ManageTests
 *  - finance: AdminClaims, AdminRevenue, ManageRefunds
 *  - email:   EmailManagement
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { WORKER_USERS } from '../fixtures/users';
import { reseedE2EUsers } from '../setup/reset';

test.beforeAll(() => {
  reseedE2EUsers(); // worker izin profillerini garantile
});

test.describe('Worker — izin matrisi erişim kontrolü', () => {
  for (const worker of WORKER_USERS) {
    const allowed = worker.workerPages ?? [];

    test(`${worker.username}: izinli sayfalarına erişebilir`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginAsUser(worker);
      // İlk izinli sayfaya git → erişebilmeli
      await page.goto(`/${allowed[0]}`);
      await expect(page).toHaveURL(new RegExp(allowed[0], 'i'), { timeout: 10000 });
    });

    test(`${worker.username}: izinsiz admin sayfasına giremez`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginAsUser(worker);
      // Bu worker'a atanmamış bir admin sayfası seç (AdminDashboard hiçbirinde yok)
      await page.goto('/AdminDashboard');
      await expect(page).not.toHaveURL(/AdminDashboard/i, { timeout: 8000 });
    });
  }

  test('email worker, finance sayfasına giremez (çapraz izolasyon)', async ({ page }) => {
    const emailWorker = WORKER_USERS.find((w) => w.workerPages?.includes('EmailManagement'))!;
    const login = new LoginPage(page);
    await login.loginAsUser(emailWorker);
    await page.goto('/AdminRevenue'); // finance worker'a ait, email worker'a değil
    await expect(page).not.toHaveURL(/AdminRevenue/i, { timeout: 8000 });
  });

  test('worker, eğitici içerik üretim sayfasına giremez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(WORKER_USERS[0]);
    await page.goto('/CreateTest');
    await expect(page).not.toHaveURL(/CreateTest/i, { timeout: 8000 });
  });
});
