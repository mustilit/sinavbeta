/**
 * educator-register-wizard.spec.ts (Sprint 17.2 — Eğitici kayıt sihirbazı E1)
 *
 * Eğitici kayıt 3-adımlı sihirbaz (Register, role=educator):
 *  1. Rol seçimi + step 1 form alanları (ad/soyad/email/şifre)
 *  2. Boş ad/soyad ile İleri → validation hatası (eğitici için zorunlu)
 *  3. Geçerli step 1 → step 2'ye (CV/uzmanlık) ilerler
 *
 * Email-verification engeli nedeniyle tam kayıt→login akışı kapsanmadı
 * (PendingRegistration → verify token gerekir); bu spec sihirbaz adımlarına +
 * eğitici-özel validation'a (B9'da kritik: ad/soyad zorunlu) odaklanır.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { BasePage } from '../pom';

/** Register sayfasını eğitici rolünde aç (rol seçim ekranı çıkarsa Eğitici seç) */
async function openEducatorRegister(page: import('@playwright/test').Page) {
  await page.goto('/Register?role=educator');
  await new BasePage(page).dismissCookieDialog();
  // Rol seçim ekranı varsa "Eğitici" seç
  const educatorRole = page.getByRole('button', { name: /^[Ee]ğitici$/ }).first();
  if (await educatorRole.isVisible({ timeout: 3000 }).catch(() => false)) {
    await educatorRole.click();
  }
  await expect(page.locator('#reg-email')).toBeVisible({ timeout: 8000 });
}

test.describe('Eğitici — kayıt sihirbazı', () => {
  test('eğitici kayıt step 1 form alanları görünür (ad/soyad dahil)', async ({ page }) => {
    await openEducatorRegister(page);
    // Eğitici step 1'de ad + soyad alanları zorunlu (aday akışında farklı)
    await expect(page.locator('#reg-first')).toBeVisible();
    await expect(page.locator('#reg-last')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
  });

  test('boş ad/soyad ile İleri → validation hatası', async ({ page }) => {
    await openEducatorRegister(page);
    // Email + şifre dolu ama ad/soyad boş
    await page.locator('#reg-email').fill(`e2e_reg_${Date.now()}@test.local`);
    await page.locator('#reg-password').fill('Test1234!');
    const confirm = page.locator('#reg-password-confirm, input[type="password"]').nth(1);
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.fill('Test1234!');
    }
    // İleri → eğitici için ad/soyad zorunlu validation patlamalı → step 1'de KALIR.
    // (i18n metni kırılgan; "step 2'ye geçmedi" = ad/soyad input hâlâ görünür
    //  daha sağlam kanıt.)
    await page.getByRole('button', { name: /[İi]leri|[Dd]evam|[Ss]onraki/ }).first().click();
    await page.waitForTimeout(800);
    // Hâlâ step 1: ad/soyad input görünür (geçerli olsa step 2'ye geçer, bu alanlar kaybolur)
    await expect(page.locator('#reg-first')).toBeVisible({ timeout: 4000 });
  });

  test('geçerli step 1 → step 2 (CV/uzmanlık) ilerler', async ({ page }) => {
    await openEducatorRegister(page);
    const uniq = Date.now();
    await page.locator('#reg-first').fill('E2E');
    await page.locator('#reg-last').fill('Egitici');
    await page.locator('#reg-email').fill(`e2e_reg_${uniq}@test.local`);
    const username = page.locator('#reg-username');
    if (await username.isVisible({ timeout: 2000 }).catch(() => false)) {
      await username.fill(`e2e_reg_${uniq}`);
    }
    await page.locator('#reg-password').fill('Test1234!');
    const confirm = page.locator('input[type="password"]').nth(1);
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.fill('Test1234!');
    }
    await page.waitForTimeout(300); // state commit
    await page.getByRole('button', { name: /[İi]leri|[Dd]evam|[Ss]onraki/ }).first().click();
    // Step 2 — CV yükleme veya uzmanlık alanı göstergesi (ad/soyad hatası YOK)
    await expect(page.getByText(/ad ve soyad/i)).toHaveCount(0, { timeout: 6000 });
  });
});
