/**
 * foundation.spec.ts (Sprint 17.1) — test altyapısının kendisini doğrular.
 *
 * Bu spec geçmeden diğer sprint spec'lerine güvenilemez.
 *
 * Gözlemlenen app davranışı (Login.jsx):
 *  - Tüm roller login sonrası /Home'a yönlenir (getHomeForRole login'de DEĞİL;
 *    o yalnız RouteGuards canAccessPage=false redirect hedefi).
 *  - Rol-spesifik dashboard'a kullanıcı navigate ederek ulaşır.
 *  - Onay aşaması eğitici (PENDING/REJECTED) EDUCATOR-only sayfaya gidemez →
 *    EducatorSettings'e redirect (B9 kilidi).
 *  - WORKER yalnız izinli sayfalarına erişir.
 *
 * ÖN KOŞUL: backend + frontend ayakta + `npm run test:e2e:seed` koşulmuş.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import {
  DEMO,
  EDUCATOR_PENDING,
  EDUCATOR_REJECTED,
  WORKER_USERS,
} from '../fixtures/users';

test.describe('Foundation — login + rol erişim matrisi', () => {
  test('demo admin login başarılı + AdminDashboard\'a erişebilir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    // Login → Home (app davranışı). Admin dashboard'a navigate edebilmeli.
    await page.goto('/AdminDashboard');
    await expect(page).toHaveURL(/AdminDashboard/i, { timeout: 10000 });
  });

  test('demo educator (ACTIVE) EducatorDashboard\'a erişebilir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/EducatorDashboard');
    await expect(page).toHaveURL(/EducatorDashboard/i, { timeout: 10000 });
  });

  test('demo candidate login başarılı + admin sayfasına giremez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    // Aday admin sayfasına URL ile gidemez → redirect
    await page.goto('/AdminDashboard');
    await expect(page).not.toHaveURL(/AdminDashboard/i, { timeout: 8000 });
  });

  test('PENDING eğitici içerik üretim sayfasına giremez → EducatorSettings', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_PENDING);
    await page.goto('/CreateTest');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
  });

  test('REJECTED eğitici EducatorSettings\'te red bildirimi görür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_REJECTED);
    await page.goto('/EducatorSettings');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
    // Red sebebi seed'de set edildi — sayfada görünmeli
    await expect(page.getByText(/eksik|red|reddedil/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('REJECTED eğitici de içerik üretim sayfasına giremez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_REJECTED);
    await page.goto('/CreateTest');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
  });

  test('WORKER izinli sayfasına erişebilir', async ({ page }) => {
    const worker = WORKER_USERS[0]; // ManageUsers + AdminUserActivity
    const login = new LoginPage(page);
    await login.loginAsUser(worker);
    await page.goto('/ManageUsers');
    await expect(page).toHaveURL(/ManageUsers/i, { timeout: 10000 });
  });

  test('WORKER izinsiz sayfaya URL ile giremez', async ({ page }) => {
    const worker = WORKER_USERS[3]; // sadece EmailManagement
    const login = new LoginPage(page);
    await login.loginAsUser(worker);
    await page.goto('/ManageUsers');
    await expect(page).not.toHaveURL(/ManageUsers/i, { timeout: 8000 });
  });

  test('yanlış şifre login reddedilir, formda kalır', async ({ page }) => {
    const login = new LoginPage(page);
    await login.expectLoginError(DEMO.admin.email, 'yanlis-sifre-123');
  });
});
