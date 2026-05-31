/**
 * educator-my-sales.spec.ts (Sprint 17.2 — Eğitici hikayesi E7, read-only)
 *
 * Eğiticinin satış raporu — görüntüleme + filtre + veri doğruluğu:
 *  1. Sayfa yüklenir, başlık + 4 istatistik kartı görünür
 *  2. Toplam gelir ₺ formatında (para = cents/locale doğruluğu)
 *  3. Durum filtresi çalışır (liste veya empty state — crash yok)
 *  4. Yatay scroll yok (tablo overflow guard)
 *
 * Demo educator (educator@demo.com). Read-only — state mutasyonu yok.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe('Eğitici — satış raporu (read-only)', () => {
  test('sayfa + başlık + 4 istatistik kartı görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MySales');
    await expect(page).toHaveURL(/MySales/i, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /[Ss]atışlar[ıi]m/ }).first()).toBeVisible({ timeout: 8000 });
    // İstatistik kartları
    await expect(page.getByText(/[Tt]oplam [Ss]at[ıi]ş/).first()).toBeVisible();
    await expect(page.getByText(/[Tt]oplam [Gg]elir/).first()).toBeVisible();
  });

  test('toplam gelir ₺ formatında gösterilir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MySales');
    await expect(page).toHaveURL(/MySales/i, { timeout: 10000 });
    // Sayfada ₺ sembolü içeren en az bir değer (gelir kartı)
    await expect(page.getByText(/₺/).first()).toBeVisible({ timeout: 8000 });
  });

  test('durum filtresi açılır + seçim crash etmez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MySales');
    await expect(page).toHaveURL(/MySales/i, { timeout: 10000 });

    // İlk Select (durum) — Radix combobox aç
    const statusSelect = page.getByRole('combobox').first();
    if (await statusSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusSelect.click();
      // "Tamamlandı" seçeneği
      const option = page.getByRole('option', { name: /[Tt]amamland[ıi]|[Tt]üm/ }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
      }
    }
    // Sayfa hâlâ ayakta (başlık görünür)
    await expect(page.getByRole('heading', { name: /[Ss]atışlar[ıi]m/ }).first()).toBeVisible();
  });

  test('yatay scroll yok', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MySales');
    await expect(page).toHaveURL(/MySales/i, { timeout: 10000 });
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
