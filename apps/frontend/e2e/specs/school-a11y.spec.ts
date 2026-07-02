/**
 * school-a11y.spec.ts — E-Sınıf auth'lu sayfaların axe-core WCAG 2.1 AA denetimi.
 *
 * Marketplace a11y.spec.ts public + aday + admin sayfalarını kapsıyordu; okul sayfaları
 * kapsamda DEĞİLDİ. Bu spec persona (username) girişiyle okul sayfalarını denetler.
 * Seed: seed-e2e.cjs seedSchoolModule (okul kodu E2E). axe fixture WCAG2.1 AA.
 */
import { test, expect } from '../fixtures/axe';
import { type Page } from '@playwright/test';
import { SCHOOL_ADMIN, SCHOOL_TEACHER, SCHOOL_STUDENT } from '../fixtures/users';

function reportViolations(violations: { id: string; description: string; nodes: unknown[] }[]) {
  if (violations.length) {
    console.log('axe ihlalleri:', JSON.stringify(violations.map((v) => ({ id: v.id, desc: v.description, count: v.nodes.length })), null, 2));
  }
}

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

test.describe('a11y — E-Sınıf öğrenci sayfaları (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await schoolLogin(page, SCHOOL_STUDENT.username, SCHOOL_STUDENT.password);
  });

  test('StudentAssignments — Ödevlerim', async ({ page, makeAxeBuilder }) => {
    await page.goto('/StudentAssignments');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('StudentExplore — Keşfet (serbest alıştırma)', async ({ page, makeAxeBuilder }) => {
    await page.goto('/StudentExplore');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('SchoolNotifications — Bildirimler', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolNotifications');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('StudentAppointments — Randevu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/StudentAppointments');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});

test.describe('a11y — E-Sınıf öğretmen sayfaları (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await schoolLogin(page, SCHOOL_TEACHER.username, SCHOOL_TEACHER.password);
  });

  test('SchoolExamPool — Sınav Havuzu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolExamPool');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('SchoolAssignments — Ödevler', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolAssignments');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('SchoolAppointments — Randevular', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolAppointments');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('SchoolNotifications — Bildirimler (öğretmen)', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolNotifications');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});

test.describe('a11y — E-Sınıf yönetici sayfaları (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await schoolLogin(page, SCHOOL_ADMIN.username, SCHOOL_ADMIN.password);
  });

  test('SchoolPanel — yönetim paneli', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolPanel');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('SchoolUsers — kullanıcı yönetimi', async ({ page, makeAxeBuilder }) => {
    await page.goto('/SchoolUsers');
    await page.waitForLoadState('networkidle');
    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});
