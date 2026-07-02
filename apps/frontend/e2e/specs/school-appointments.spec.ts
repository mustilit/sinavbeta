/**
 * school-appointments.spec.ts — E-Sınıf randevu akışı (öğretmen uygunluk +
 * öğrenci rezervasyon + öğretmen onay + öğrenci iptal) tarayıcı e2e'si.
 *
 * Bu akış canlı staging'de API seviyesinde uçtan uca doğrulandı; bu spec aynı
 * yolu gerçek UI ile CI'da regresyona karşı kilitler.
 *
 * Seed: seed-e2e.cjs seedSchoolModule → okul E2E + öğretmen E2E-T-0001 (5-A
 * sınıf öğretmeni) + öğrenci E2E-S-0001 (5-A) + Matematik dersi.
 * Çalıştırma: npm run test:e2e:seed && npx playwright test school-appointments
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

/** Radix Select seçeneğini aç + tıkla (jsdom değil gerçek tarayıcı → çalışır). */
async function pickSelectOption(page: Page, triggerLabel: RegExp | string, optionText: RegExp | string): Promise<void> {
  await page.getByRole('combobox', { name: triggerLabel }).first().click().catch(async () => {
    // aria-label yoksa görünür ilk trigger'ı kullan
    await page.locator('[role="combobox"]').first().click();
  });
  await page.getByRole('option', { name: optionText }).first().click();
}

test.describe('E-Sınıf — Randevu akışı (uygunluk → rezervasyon → onay → iptal)', () => {
  test('öğretmen uygunluk girer, öğrenci randevu alır, öğretmen onaylar, öğrenci iptal eder', async ({ browser }) => {
    // — 1) Öğretmen: haftalık uygunluk gir —
    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await schoolLogin(teacher, SCHOOL_TEACHER.username, SCHOOL_TEACHER.password);
    await teacher.goto('/SchoolAppointments');
    await teacher.getByRole('button', { name: /uygunluk/i }).click();
    // Varsayılan gün (Pazartesi) + 09:00–09:30 slotu
    await teacher.getByRole('button', { name: /^Ekle$/ }).click();
    await teacher.getByRole('button', { name: /kaydet/i }).click();
    await expect(teacher.getByText(/uygunluk kaydedildi|kaydedildi/i).first()).toBeVisible({ timeout: 10000 });

    // — 2) Öğrenci: öğretmeni seç, slot al —
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await schoolLogin(student, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
    await student.goto('/StudentAppointments');
    // Öğretmen seçimi (Radix Select)
    await pickSelectOption(student, /öğretmen/i, /Test Öğretmen|Öğretmen/i);
    // İlk uygun slota tıkla (09:00 içeren buton)
    const slotBtn = student.getByRole('button', { name: /09:00/ }).first();
    await slotBtn.waitFor({ state: 'visible', timeout: 10000 });
    await slotBtn.click();
    // Onay dialog'unda "Randevu Al"
    const dialog = student.getByRole('dialog');
    await dialog.getByRole('button', { name: /randevu al/i }).click();
    await expect(student.getByText(/randevu talebiniz|oluşturuldu/i).first()).toBeVisible({ timeout: 10000 });

    // — 3) Öğretmen: randevu PENDING → Onayla —
    await teacher.goto('/SchoolAppointments');
    await teacher.getByRole('button', { name: /randevular/i }).first().click();
    await expect(teacher.getByText(/Test Öğrenci|Öğrenci/).first()).toBeVisible({ timeout: 10000 });
    await teacher.getByRole('button', { name: /onayla/i }).first().click();

    // — 4) Öğrenci: onaylanmış randevuyu görür + iptal eder —
    await student.goto('/StudentAppointments');
    await student.getByRole('button', { name: /randevularım/i }).click();
    await expect(student.getByText(/onaylandı/i).first()).toBeVisible({ timeout: 10000 });
    await student.getByRole('button', { name: /iptal et/i }).first().click();
    await expect(student.getByText(/iptal edildi/i).first()).toBeVisible({ timeout: 10000 });

    await teacherCtx.close();
    await studentCtx.close();
  });
});
