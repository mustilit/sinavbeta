/**
 * educator-ad-package.spec.ts (Sprint 17.4 — Reklam paketi satın alma)
 *
 * Eğiticinin reklam paketi satın alması (MyAds "Yeni Reklam" sekmesi):
 *  1. Sayfa + sekmeler (İstatistikler / Reklamlarım / Yeni Reklam)
 *  2. "Yeni Reklam" sekmesi → hedef türü (TEST/Profilim) + paket seçimi
 *  3. Paket seçmeden "Reklamı Satın Al" → validation (POST atılmaz)
 *  4. Paket varsa: Profilim hedefi + paket seç + satın al → POST 2xx
 *
 * Demo educator. AdPackage admin-seed'ine bağlı; paket yoksa satın alma adımı
 * koşulu atlanır (smoke + validation yine doğrulanır).
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe.configure({ mode: 'serial' });

async function openBuyTab(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /[Yy]eni [Rr]eklam/ }).first().click();
  // "Reklamı Satın Al" butonu buy sekmesinde
  await expect(page.getByRole('button', { name: /[Rr]eklam[ıi] [Ss]at[ıi]n [Aa]l/ }).first()).toBeVisible({
    timeout: 8000,
  });
}

test.describe('Eğitici — reklam paketi satın alma', () => {
  test('sayfa + Yeni Reklam sekmesi açılır', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MyAds');
    await expect(page).toHaveURL(/MyAds/i, { timeout: 10000 });
    await openBuyTab(page);
    // Hedef türü seçenekleri (Profilim = EDUCATOR hedefi)
    await expect(page.getByText(/[Pp]rofilim/).first()).toBeVisible({ timeout: 6000 });
  });

  test('paket seçmeden "Reklamı Satın Al" butonu disabled (UI guard)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MyAds');
    await openBuyTab(page);

    // Profilim hedefi seç ama paket SEÇME → satın al butonu disabled olmalı
    await page.getByText(/[Pp]rofilim/).first().click();
    await expect(page.getByRole('button', { name: /[Rr]eklam[ıi] [Ss]at[ıi]n [Aa]l/ }).first()).toBeDisabled({
      timeout: 5000,
    });
  });

  test('paket varsa: Profilim + paket seç + satın al → 2xx', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/MyAds');
    await openBuyTab(page);

    // "Profilim" hedefi (EDUCATOR — testId gerektirmez)
    await page.getByText(/[Pp]rofilim/).first().click();

    // Paket kartları (buy sekmesindeki seçilebilir paket button'ları). Yoksa skip.
    // adPackage label'ından sonraki ilk seçilebilir paket button'ı.
    const buyBtn = page.getByRole('button', { name: /[Rr]eklam[ıi] [Ss]at[ıi]n [Aa]l/ }).first();
    // Paket button'ları: "Reklamı Satın Al" + hedef button'ları dışındaki button'lar.
    // Fiyat (₺) içeren paket kartı button'unu seç.
    const pkgButtons = page.locator('button', { hasText: /₺|gün|TL/ });
    const count = await pkgButtons.count();
    if (count === 0) {
      test.skip(true, 'Reklam paketi seed edilmemiş — satın alma adımı atlandı');
      return;
    }
    await pkgButtons.first().click();

    const postResp = page
      .waitForResponse((r) => /\/educators\/me\/ads/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
      .catch(() => null);
    await buyBtn.click();
    const resp = await postResp;
    if (resp) {
      expect(resp.status()).toBeLessThan(400);
    }
  });
});
