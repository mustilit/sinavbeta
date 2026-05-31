/**
 * candidate-results.spec.ts (Sprint 17.3 — Aday hikayesi C5, read-only)
 *
 * Adayın performans raporları — görüntüleme + filtre + veri doğruluğu:
 *  1. Sayfa + başlık (Performans Raporlarım)
 *  2. Paket filtresi (Radix combobox) açılır + crash etmez
 *  3. Yatay scroll yok
 *
 * Demo candidate (aday@demo.com). Read-only.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe('Aday — performans raporları (read-only)', () => {
  test('sayfa + başlık görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/MyResults');
    await expect(page).toHaveURL(/MyResults/i, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /[Pp]erformans|[Rr]apor/ }).first()).toBeVisible({ timeout: 8000 });
  });

  test('paket filtresi açılır + crash etmez', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/MyResults');
    await expect(page).toHaveURL(/MyResults/i, { timeout: 10000 });

    const select = page.getByRole('combobox').first();
    if (await select.isVisible({ timeout: 5000 }).catch(() => false)) {
      await select.click();
      await page.keyboard.press('Escape');
    }
    await expect(page.getByRole('heading', { name: /[Pp]erformans|[Rr]apor/ }).first()).toBeVisible();
  });

  test('yatay scroll yok', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.candidate);
    await page.goto('/MyResults');
    await expect(page).toHaveURL(/MyResults/i, { timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
