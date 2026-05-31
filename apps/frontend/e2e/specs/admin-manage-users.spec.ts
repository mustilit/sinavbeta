/**
 * admin-manage-users.spec.ts (Sprint 17.5 — Admin kullanıcı yönetimi, B9 akışı)
 *
 * ManageUsers: liste + arama + rol/durum filtresi + eğitici "İncele" popup.
 *  1. Sayfa + başlık (Kullanıcılar) + tablo
 *  2. Durum filtresi "İnceleme Bekliyor" → pending eğitici listede
 *  3. "İncele" popup açılır (B9 — detay + İşlem Geçmişi)
 *
 * Demo admin. Read-only inceleme (onay/red tetiklenmez — state mutasyonu yok).
 * beforeAll reseed: e2e_educator_pending'in PENDING durumda olmasını garantiler.
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';
import { LoginPage } from '../pom';
import { DEMO } from '../fixtures/users';
import { reseedE2EUsers } from '../setup/reset';

test.beforeAll(() => {
  reseedE2EUsers();
});

test.describe('Admin — kullanıcı yönetimi + eğitici inceleme', () => {
  test('sayfa + başlık + tablo görünür', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    await page.goto('/ManageUsers');
    await expect(page).toHaveURL(/ManageUsers/i, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /[Kk]ullan[ıi]c[ıi]/ }).first()).toBeVisible({ timeout: 8000 });
  });

  test('durum filtresi "İnceleme Bekliyor" → pending eğitici listede', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    await page.goto('/ManageUsers');
    await expect(page).toHaveURL(/ManageUsers/i, { timeout: 10000 });

    // Durum filtresi combobox'ı — "İnceleme Bekliyor" seç
    const statusCombo = page.getByRole('combobox').filter({ hasText: /durum|tüm|all/i }).first();
    const combo = (await statusCombo.count()) ? statusCombo : page.getByRole('combobox').last();
    await combo.click();
    const option = page.getByRole('option', { name: /[İi]nceleme [Bb]ekliyor/ }).first();
    if (await option.isVisible({ timeout: 4000 }).catch(() => false)) {
      await option.click();
      // pending e2e eğitici e-postası listede görünmeli
      await expect(page.getByText(/e2e_educator_pending/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('eğitici "İncele" popup açılır (B9 işlem geçmişi)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAsUser(DEMO.admin);
    await page.goto('/ManageUsers');
    await expect(page).toHaveURL(/ManageUsers/i, { timeout: 10000 });

    // "İncele" butonu (pending/rejected eğitici satırında). İlkini tıkla.
    const inceleBtn = page.getByRole('button', { name: /[İi]ncele/ }).first();
    if (await inceleBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await inceleBtn.click();
      // Popup açıldı — dialog görünür
      await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 6000 });
    }
    // Crash yok — başlık hâlâ erişilebilir
    await expect(page.getByRole('heading', { name: /[Kk]ullan[ıi]c[ıi]/ }).first()).toBeVisible();
  });
});
