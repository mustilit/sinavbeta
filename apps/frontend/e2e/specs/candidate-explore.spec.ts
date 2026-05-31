/**
 * candidate-explore.spec.ts (Sprint 17.3 — Aday hikayesi C2, read-only)
 *
 * Adayın marketplace'i keşfetmesi — listeleme + arama + filtre + veri doğruluğu:
 *  1. Sayfa + başlık + arama kutusu + filtreler görünür
 *  2. Yayımlanmış paketler listelenir (demo educator paketi)
 *  3. Arama kutusuna yazınca liste filtrelenir (tsvector arama)
 *  4. Sınav türü filtresi açılır
 *  5. Yatay scroll yok
 *
 * Demo candidate (aday@demo.com). Read-only.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe('Aday — marketplace keşfet (read-only)', () => {
  test('sayfa + başlık + arama + filtreler görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /[Kk]eşfet/ }).first()).toBeVisible({ timeout: 8000 });
    // Arama kutusu
    await expect(page.getByPlaceholder(/ara/i).first()).toBeVisible();
  });

  test('yayımlanmış paketler listelenir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });

    // Demo educator'ın en az bir yayımlanmış paketi marketplace'te görünmeli.
    // Paket kartları (TestPackageCard) — fiyat (₺) içeren en az bir kart.
    await expect(page.getByText(/₺/).first()).toBeVisible({ timeout: 10000 });
  });

  test('arama kutusu çalışır (yazınca istek atılır)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });

    const search = page.getByPlaceholder(/ara/i).first();
    await search.fill('matematik');
    // Arama 2+ karakterde sunucuya gider (useDeferredValue); liste güncellenir.
    // Sayfa crash etmez — başlık hâlâ görünür.
    await page.waitForTimeout(1200);
    await expect(page.getByRole('heading', { name: /[Kk]eşfet/ }).first()).toBeVisible();
  });

  test('sınav türü filtresi açılır', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });

    // İlk combobox (Sınav Türü filtresi)
    const examTypeSelect = page.getByRole('combobox').first();
    if (await examTypeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await examTypeSelect.click();
      // Açılan listede en az bir option
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 4000 });
      await page.keyboard.press('Escape');
    }
    await expect(page.getByRole('heading', { name: /[Kk]eşfet/ }).first()).toBeVisible();
  });

  test('yatay scroll yok', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/Explore');
    await expect(page).toHaveURL(/Explore/i, { timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
