/**
 * email.spec.js — Email modülü akış testleri (smoke)
 *
 * Kapsam: localStorage manipülasyonu olmadan public + auth akışları.
 *   1) Public Unsubscribe sayfası — token geçersizse hata mesajı görünür.
 *   2) Admin Mail sayfalarına auth gerektiği için redirect olur (Login'e).
 *
 * Auth gerektiren detaylı testler (kill switch toggle, provider create) için
 * mevcut smoke.spec.js'deki login fixture kullanılarak ayrı bir spec yazılmalı.
 *
 * Çalıştır: npm run test:e2e -- e2e/specs/email.spec.js
 */
import { test, expect } from '@playwright/test';

test.describe('Email modülü — public davranış', () => {
  test('Unsubscribe geçersiz token ile hata mesajı gösterir', async ({ page }) => {
    await page.goto('/Unsubscribe?token=geçersiz');
    await page.waitForLoadState('networkidle');

    // Sayfa "Token geçersiz" benzeri bir hata mesajı içermeli
    // Sayfa Türkçe — kelime mağdurunluk paterni: "token", "geçersiz", "hata"
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/token|geçersiz|hata|invalid/i);
  });

  test('Admin email panel auth olmadan login sayfasına yönlendirir', async ({ page }) => {
    await page.goto('/EmailDashboard');
    await page.waitForLoadState('networkidle');

    // Login sayfasına yönlendirilmeli ya da auth uyarısı görünmeli
    const url = page.url();
    expect(url).toMatch(/Login|login|\?from=/);
  });

  test('Admin kill switch sayfası auth olmadan login sayfasına yönlendirir', async ({ page }) => {
    await page.goto('/EmailKillSwitches');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toMatch(/Login|login|\?from=/);
  });

  test('Admin providers sayfası auth olmadan login sayfasına yönlendirir', async ({ page }) => {
    await page.goto('/EmailProviders');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toMatch(/Login|login|\?from=/);
  });
});
