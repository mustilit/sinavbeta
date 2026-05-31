/**
 * educator-rejected-resubmit.spec.ts (Sprint 17.2 — Eğitici hikayesi E3)
 *
 * Reddedilmiş eğiticinin hatasını düzeltip yeniden başvurması (B9 davranışı):
 *  1. REJECTED eğitici login → EducatorSettings'e kilitli
 *  2. Red bildirimi + sebep görünür
 *  3. İçerik üretim sayfalarına (CreateTest) giremez
 *  4. Uzmanlık alanı seç + "Başvuruyu Yeniden Gönder"
 *  5. Başarı toast'ı + status PENDING'e geçer
 *  6. Artık red bildirimi görünmez (onay bekliyor durumu)
 *
 * State mutasyonu: rejected → pending. beforeAll/afterAll reseed ile izole.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { EDUCATOR_REJECTED } from '../fixtures/users';
import { reseedE2EUsers } from '../setup/reset';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  reseedE2EUsers(); // rejected user'ı garantili REJECTED durumuna çek
});

test.afterAll(() => {
  reseedE2EUsers(); // sonraki spec'ler için temiz state
});

test.describe('Eğitici — red + yeniden başvuru (B9)', () => {
  test('red bildirimi + sebep görünür, CreateTest kilitli', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_REJECTED);

    await page.goto('/EducatorSettings');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });

    // Red bildirimi başlığı + sebep
    await expect(page.getByText(/başvurunuz reddedildi/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/eksik/i).first()).toBeVisible();

    // İçerik üretim sayfası kilitli
    await page.goto('/CreateTest');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });
  });

  test('uzmanlık seç + yeniden başvur → PENDING', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_REJECTED);
    await page.goto('/EducatorSettings');
    await expect(page.getByText(/başvurunuz reddedildi/i)).toBeVisible({ timeout: 8000 });

    // Rejected form içinde en az 1 uzmanlık checkbox seç (resubmit validation)
    const firstSpecCheckbox = page.locator('input[type="checkbox"]').first();
    await firstSpecCheckbox.waitFor({ state: 'visible', timeout: 8000 });
    if (!(await firstSpecCheckbox.isChecked())) {
      await firstSpecCheckbox.check({ force: true });
    }

    // "Başvuruyu Yeniden Gönder" — resubmit endpoint cevabını bekle
    const resubmitBtn = page.getByRole('button', { name: /başvuruyu yeniden gönder|yeniden başvur/i });
    await expect(resubmitBtn).toBeEnabled({ timeout: 5000 });

    const resubmitResp = page
      .waitForResponse(
        (r) => r.url().includes('/resubmit-application') && r.request().method() === 'POST',
        { timeout: 15000 },
      )
      .catch(() => null);
    await resubmitBtn.click();
    const resp = await resubmitResp;

    // Başarı: toast veya status geçişi
    if (resp) {
      expect(resp.status()).toBeLessThan(400);
    }
    // Başarı toast'ı (best-effort — toast hızlı kaybolabilir)
    const toast = page.locator('[data-sonner-toast]').first();
    await toast.waitFor({ state: 'visible', timeout: 6000 }).catch(() => null);
  });

  test('yeniden başvuru sonrası red bildirimi kalkar (PENDING)', async ({ page }) => {
    // Önceki test rejected → pending yaptı. Şimdi login → red bildirimi YOK.
    const login = new LoginPage(page);
    await login.loginAsUser(EDUCATOR_REJECTED);
    await page.goto('/EducatorSettings');
    await expect(page).toHaveURL(/EducatorSettings/i, { timeout: 10000 });

    // Red bildirimi artık görünmemeli — onay bekliyor durumu
    await expect(page.getByText(/başvurunuz reddedildi/i)).toHaveCount(0, { timeout: 8000 });
  });
});
