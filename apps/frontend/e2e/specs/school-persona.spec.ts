/**
 * school-persona.spec.ts — E-Sınıf (okul) persona giriş + sayfa erişim smoke'u.
 *
 * Marketplace e2e'sinden bağımsız B2B dikeyi: okul kullanıcısı User.role=CANDIDATE'tir,
 * gerçek yetki SchoolUser.schoolRole ile taşınır; giriş USERNAME ile yapılır
 * (?context=school, #login-email type=text). Üç persona:
 *   - Öğrenci (E2E-S-0001)  → Ödevlerim
 *   - Öğretmen (E2E-T-0001) → Sınav Havuzu
 *   - Okul Yöneticisi (E2E-A-0001) → Kullanıcılar + Panel
 *
 * Seed: e2e/setup/seed-e2e.cjs `seedSchoolModule()` (okul kodu E2E + 3 kullanıcı).
 * Çalıştırma (CI / lokal): npm run test:e2e:seed && npx playwright test school-persona.
 */
import { test } from '../fixtures/auth';
import { expect, type Page } from '@playwright/test';
import { SCHOOL_ADMIN, SCHOOL_TEACHER, SCHOOL_STUDENT } from '../fixtures/users';

/** İlk girişte açılan rol bazlı bilgilendirme turunu (varsa) kapat — assertion'ı bloklamasın. */
async function dismissOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /atla|geç|kapat|skip|bitir|tamam|anladım/i }).first();
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skip.click().catch(() => undefined);
  }
}

/** Okul kullanıcısı USERNAME ile giriş (?context=school → #login-email type=text). */
async function schoolLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/Login?context=school');
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /giriş yap|sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), { timeout: 15000 });
  const cookieAccept = page.getByRole('button', { name: /kabul et|accept|tümüne izin/i }).first();
  if (await cookieAccept.isVisible({ timeout: 2000 }).catch(() => false)) await cookieAccept.click();
}

test.describe('E-Sınıf — persona giriş + sayfa erişimi (seed: okul E2E)', () => {
  test('öğrenci: kullanıcı adıyla giriş → Ödevlerim', async ({ page }) => {
    await schoolLogin(page, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
    await page.goto('/StudentAssignments');
    await dismissOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Ödevlerim' })).toBeVisible({ timeout: 10000 });
  });

  test('öğretmen: giriş → Sınav Havuzu', async ({ page }) => {
    await schoolLogin(page, SCHOOL_TEACHER.username, SCHOOL_TEACHER.password);
    await page.goto('/SchoolExamPool');
    await dismissOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Sınav Havuzu' })).toBeVisible({ timeout: 10000 });
  });

  test('okul yöneticisi: giriş → Kullanıcılar + Panel', async ({ page }) => {
    await schoolLogin(page, SCHOOL_ADMIN.username, SCHOOL_ADMIN.password);
    await page.goto('/SchoolUsers');
    await dismissOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible({ timeout: 10000 });
    await page.goto('/SchoolPanel');
    await expect(page.getByText('E2E Test Okulu').first()).toBeVisible({ timeout: 10000 });
  });

  test('öğrenci marketplace yönetim sayfasına erişemez (izolasyon)', async ({ page }) => {
    await schoolLogin(page, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
    // Okul öğrencisi (CANDIDATE) admin/eğitici yönetim sayfasına girmemeli.
    await page.goto('/SchoolUsers');
    await dismissOnboarding(page);
    await expect(page.getByText(/Erişim yok/i).first()).toBeVisible({ timeout: 10000 });
  });
});
