/**
 * educator-discount-code.spec.ts (Sprint 17.2 — Eğitici hikayesi E6)
 *
 * Eğiticinin indirim kodu oluşturması (DiscountCode, educator→aday):
 *  1. "Yeni Kod" → dialog → kod + oran (cap altı) → "Oluştur" → 2xx + dönen veri doğru
 *  2. Üst sınır aşımı: oran cap üstü → validation hatası (kod oluşmaz, POST atılmaz)
 *
 * NOT: maksimum indirim oranı admin ayarından gelir (effectiveMaxDiscount —
 * bu ortamda %25). Cap altı=20, cap üstü=30 ile test edilir. Input'lar DIALOG
 * scope'unda doldurulur (sayfa filtre number input'larıyla karışmamak için).
 *
 * Demo educator (educator@demo.com) — ACTIVE + paketli.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe.configure({ mode: 'serial' });

test.describe('Eğitici — indirim kodu oluştur', () => {
  test('cap altı oran ile yeni kod oluştur → 2xx + dönen veri doğru', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MyDiscountCodes');
    await expect(page).toHaveURL(/MyDiscountCodes/i, { timeout: 10000 });

    await page.getByRole('button', { name: /[Yy]eni [Kk]od/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    const code = `E2E${Date.now()}`;
    // Input'lar DIALOG scope'unda — sayfa filtre number input'larıyla karışma.
    await dialog.getByPlaceholder(/YENI2024/i).fill(code);
    await dialog.locator('input[type="number"]').first().fill('20'); // cap (%25) altı oran

    const createResp = page
      .waitForResponse((r) => /discount-codes/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
      .catch(() => null);
    await dialog.getByRole('button', { name: /^[Oo]luştur$/ }).first().click();
    const resp = await createResp;

    expect(resp, 'discount create response yakalanmalı').not.toBeNull();
    expect(resp!.status()).toBeLessThan(400);
    // Dönen veri doğruluğu: oluşturulan kod + oran response'ta
    const body = await resp!.json().catch(() => ({}));
    expect(JSON.stringify(body)).toContain(code);
    expect(body.percentOff ?? body.discount_percent).toBe(20);
  });

  test('üst sınır aşımı → validation hatası (kod oluşmaz, POST atılmaz)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MyDiscountCodes');

    await page.getByRole('button', { name: /[Yy]eni [Kk]od/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    const code = `E2EBIG${Date.now()}`;
    await dialog.getByPlaceholder(/YENI2024/i).fill(code);
    await dialog.locator('input[type="number"]').first().fill('30'); // cap (%25) üstü

    // POST atılmamalı (client-side cap validation)
    const postFired = page
      .waitForResponse((r) => /discount-codes/i.test(r.url()) && r.request().method() === 'POST', { timeout: 4000 })
      .catch(() => null);
    await dialog.getByRole('button', { name: /^[Oo]luştur$/ }).first().click();
    const resp = await postFired;
    expect(resp, 'cap üstü oranda POST atılmamalı').toBeNull();

    // Hata toast'ı görünür (maksimum oran uyarısı)
    await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible({ timeout: 6000 });
  });
});
