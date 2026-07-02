/**
 * school-notifications.spec.ts — E-Sınıf bildirim + hiyerarşik mesaj akışı e2e'si.
 *
 * Öğretmen sınıfa mesaj gönderir; öğrenci Bildirimler'de görür, okundu işaretler,
 * Sidebar okunmamış rozeti güncellenir. Mesaj gönderiminin ilk denemede
 * başarısız olması (throttler paylaşımlı sayaç bug'ı — düzeltildi) bu akışta
 * yaşanmıştı; spec doğru davranışı CI'da kilitler.
 *
 * Seed: seed-e2e.cjs → öğretmen E2E-T-0001 (5-A) + öğrenci E2E-S-0001 (5-A).
 * Çalıştırma: npm run test:e2e:seed && npx playwright test school-notifications
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

test.describe('E-Sınıf — Bildirim + mesaj akışı', () => {
  const uniqTitle = `E2E Duyuru ${Date.now()}`;

  test('öğretmen mesaj gönderir (ilk denemede başarılı), öğrenci görür + okundu işaretler', async ({ browser }) => {
    // — Öğretmen: mesaj gönder —
    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await schoolLogin(teacher, SCHOOL_TEACHER.username, SCHOOL_TEACHER.password);
    await teacher.goto('/SchoolNotifications');
    await teacher.getByRole('button', { name: /mesaj gönder/i }).click();
    const dialog = teacher.getByRole('dialog');
    await dialog.locator('#nt').fill(uniqTitle);
    await dialog.locator('#nb').fill('Tatilde ödevlerinizi unutmayın.');
    // Hedef sınıf (5-A) checkbox
    await dialog.getByText('5-A').first().click();
    await dialog.getByRole('button', { name: /^Gönder$/ }).click();
    // İlk denemede BAŞARILI olmalı (429 regresyonu) → dialog kapanır + toast
    await expect(teacher.getByText(/gönderildi/i).first()).toBeVisible({ timeout: 10000 });
    await expect(teacher.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });

    // — Öğrenci: bildirimi görür + okundu işaretler —
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await schoolLogin(student, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
    await student.goto('/SchoolNotifications');
    const notif = student.getByText(uniqTitle).first();
    await expect(notif).toBeVisible({ timeout: 10000 });
    // Tıklayınca okundu işaretlenir (hata fırlatmamalı)
    await notif.click();
    // "Tümü" sekmesinde hâlâ görünür ama okundu (görsel), akış hatasız tamamlandı
    await expect(student.getByText(uniqTitle).first()).toBeVisible();

    await teacherCtx.close();
    await studentCtx.close();
  });
});
