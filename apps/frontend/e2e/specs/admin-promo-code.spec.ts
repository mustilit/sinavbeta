/**
 * admin-promo-code.spec.ts (Sprint 17.4 — Admin platform promo kodu, form-create)
 *
 * Sprint 15 — Admin'in eğiticiye yönelik platform promo kodu oluşturması
 * (LIVE_SESSION / AD_PACKAGE scope):
 *  1. "Yeni Kod" → inline form → kod + oran + scope → "Oluştur" → 2xx + listede
 *  2. Scope seçmeden → validation hatası (kod + en az 1 scope zorunlu)
 *
 * Demo admin. id'li input'lar (#promo-code, #promo-percent) — inline form,
 * dialog-scope gerekmez. Unique kod (timestamp) ile izole.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe.configure({ mode: 'serial' });

test.describe('Admin — platform promo kodu oluştur', () => {
  test('kod + scope ile oluştur → 2xx + listede görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    await page.goto('/ManagePromoCodes');
    await expect(page).toHaveURL(/ManagePromoCodes/i, { timeout: 10000 });

    await page.getByRole('button', { name: /[Yy]eni [Kk]od/ }).first().click();
    await expect(page.locator('#promo-code')).toBeVisible({ timeout: 8000 });

    const code = `PROMO${Date.now()}`;
    await page.locator('#promo-code').fill(code);
    await page.locator('#promo-percent').fill('40');
    // En az 1 scope checkbox (LIVE_SESSION — "Canlı Test")
    await page.getByRole('checkbox').first().check({ force: true });

    const createResp = page
      .waitForResponse((r) => /promo-code/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
      .catch(() => null);
    await page.getByRole('button', { name: /^[Oo]luştur$/ }).first().click();
    const resp = await createResp;

    expect(resp, 'promo create response yakalanmalı').not.toBeNull();
    expect(resp!.status()).toBeLessThan(400);
    const body = await resp!.json().catch(() => ({}));
    expect(JSON.stringify(body)).toContain(code);
  });

  test('scope seçmeden → validation hatası (POST atılmaz)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    await page.goto('/ManagePromoCodes');

    await page.getByRole('button', { name: /[Yy]eni [Kk]od/ }).first().click();
    await expect(page.locator('#promo-code')).toBeVisible({ timeout: 8000 });

    const code = `PROMONOSCOPE${Date.now()}`;
    await page.locator('#promo-code').fill(code);
    await page.locator('#promo-percent').fill('30');
    // Scope SEÇME → client validation patlar, create olmaz. POST atılmadığını +
    // form'un açık kaldığını (başarılı olsa kapanır/reset) doğrula — toast tipine
    // güvenme (kırılgan).
    const postFired = page
      .waitForResponse((r) => /promo-code/i.test(r.url()) && r.request().method() === 'POST', { timeout: 3500 })
      .catch(() => null);
    await page.getByRole('button', { name: /^[Oo]luştur$/ }).first().click();
    const resp = await postFired;
    expect(resp, 'scope yokken POST atılmamalı').toBeNull();
    // Form hâlâ açık (create başarısız) — kod input değeri korunmuş
    await expect(page.locator('#promo-code')).toHaveValue(code, { timeout: 3000 });
  });
});
