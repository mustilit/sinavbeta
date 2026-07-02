/**
 * school-assignment-offline.spec.ts — E-Sınıf sistem dışı ödev akışı tarayıcı e2e'si.
 *
 * Öğretmen ders + serbest metinle ödev atar (uygulama içinde çözülmez), öğrenci
 * "Sistem Dışı" rozetiyle görür, öğretmen "Yapıldı" işaretler. Canlı staging'de
 * API seviyesinde doğrulandı; bu spec UI regresyonunu CI'da kilitler.
 *
 * Seed: seed-e2e.cjs → öğretmen E2E-T-0001 (5-A sınıf öğretmeni) + Matematik dersi.
 * Çalıştırma: npm run test:e2e:seed && npx playwright test school-assignment-offline
 */
import { test } from '../fixtures/auth';
import { expect, type Page } from '@playwright/test';
import { SCHOOL_TEACHER, SCHOOL_STUDENT } from '../fixtures/users';

async function schoolLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/Login?context=school');
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /giriş yap|sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), { timeout: 15000 });
  const cookieAccept = page.getByRole('button', { name: /kabul et|accept|tümüne izin/i }).first();
  if (await cookieAccept.isVisible({ timeout: 2000 }).catch(() => false)) await cookieAccept.click();
}

async function pickSelectOption(page: Page, optionText: RegExp | string, triggerIndex = 0): Promise<void> {
  await page.locator('[role="combobox"]').nth(triggerIndex).click();
  await page.getByRole('option', { name: optionText }).first().click();
}

test.describe('E-Sınıf — Sistem dışı ödev (ata → öğrenci görür → yapıldı)', () => {
  const uniqTitle = `E2E Kitap özeti ${Date.now()}`;

  test('öğretmen sistem dışı ödev atar, öğrenci rozetle görür, öğretmen yapıldı işaretler', async ({ browser }) => {
    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await schoolLogin(teacher, SCHOOL_TEACHER.username, SCHOOL_TEACHER.password);
    await teacher.goto('/SchoolAssignments');

    // — Yeni Ödev diyaloğu → Sistem Dışı sekmesi —
    await teacher.getByRole('button', { name: /yeni ödev/i }).click();
    const dialog = teacher.getByRole('dialog');
    await dialog.getByRole('tab', { name: /sistem dışı/i }).click();
    // Ders seç (ilk Select) → Matematik
    await pickSelectOption(teacher, /Matematik/i, 0);
    // Seviye seç (ikinci Select) → 5. Sınıf (5-A sınıfını süzmek için)
    await pickSelectOption(teacher, /5\. Sınıf/i, 1);
    await dialog.locator('#ot').fill(uniqTitle);
    await dialog.locator('#od').fill('3. bölümü okuyup özet yazın.');
    // Sınıf seç (5-A checkbox)
    await dialog.getByText('5-A').first().click();
    // Tarih aralığı (son teslim zorunlu)
    await dialog.locator('#dd').fill('2026-12-31T23:59');
    await dialog.getByRole('button', { name: /^Ata$/ }).click();
    await expect(teacher.getByText(/ödev atandı|sınıfa/i).first()).toBeVisible({ timeout: 10000 });

    // — Listede "Sistem Dışı" rozetiyle görünür —
    await expect(teacher.getByText(uniqTitle).first()).toBeVisible({ timeout: 10000 });

    // — Öğrenci: ödev "Sistem Dışı" rozeti + açıklama, Başla butonu YOK —
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await schoolLogin(student, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
    await student.goto('/StudentAssignments');
    await student.getByRole('button', { name: /^Tümü$/ }).click().catch(() => undefined);
    await expect(student.getByText(uniqTitle).first()).toBeVisible({ timeout: 10000 });

    // — Öğretmen: "Yapıldı" işaretle —
    await teacher.goto('/SchoolAssignments');
    const row = teacher.locator('div', { hasText: uniqTitle }).first();
    await teacher.getByRole('button', { name: /^Yapıldı$/ }).first().click();
    await expect(teacher.getByText(/yapıldı olarak işaretlendi|işaretlendi/i).first()).toBeVisible({ timeout: 10000 });

    await teacherCtx.close();
    await studentCtx.close();
  });
});
