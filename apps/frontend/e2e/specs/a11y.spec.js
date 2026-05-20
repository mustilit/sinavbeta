/**
 * a11y.spec.js — axe-core ile WCAG 2.1 AA erişilebilirlik testleri
 *
 * Kapsam: Backend çalışıyor olmalı (localhost:3000).
 * KALITE-DEGERLENDIRME §11 "10 kritik sayfa" hedefi.
 *
 * Çalıştır:
 *   npm run test:e2e:a11y                         # tüm a11y spec'i
 *   npm run test:e2e -- e2e/specs/a11y.spec.js    # tek dosya
 *
 * Beklenti: results.violations === [] (WCAG 2.0 AA + 2.1 AA).
 * İhlal varsa konsola JSON döküm + test fail.
 */
import { test, expect } from '../fixtures/axe.js';

/**
 * Tek noktadan a11y kontrolü. Violation varsa okunabilir JSON log + fail.
 * @param {object} ctx - { page, makeAxeBuilder }
 * @param {string} url - test edilecek URL
 * @param {object} [options]
 * @param {string[]} [options.disableRules] - bilinçli atlanan kurallar (gerekçeli)
 */
async function expectNoA11yViolations(ctx, url, options = {}) {
  const { page, makeAxeBuilder } = ctx;
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  let builder = makeAxeBuilder();
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }
  const results = await builder.analyze();

  if (results.violations.length > 0) {
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      samples: v.nodes.slice(0, 3).map((n) => ({
        html: n.html?.slice(0, 200),
        target: n.target,
      })),
    }));
    console.log(`[a11y] ${url} violations:\n${JSON.stringify(summary, null, 2)}`);
  }
  expect(results.violations).toEqual([]);
}

test.describe('A11y — public sayfalar (10 kritik / WCAG 2.1 AA)', () => {
  test('Home ana sayfa', async (ctx) => {
    await expectNoA11yViolations(ctx, '/');
  });

  test('Explore test listesi', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Explore');
  });

  test('Login formu', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Login');
  });

  test('Register formu', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Register');
  });

  test('Educators listesi', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Educators');
  });

  test('Packages listesi', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Packages');
  });

  test('LiveSessions listesi', async (ctx) => {
    await expectNoA11yViolations(ctx, '/LiveSessions');
  });
});

test.describe('A11y — aday rolü (CANDIDATE)', () => {
  test.beforeEach(async ({ page }) => {
    // Demo aday hesabı ile giriş
    await page.goto('/Login');
    await page.getByPlaceholder(/ornek@email.com/i).fill('aday@demo.com');
    await page.locator('input[type="password"]').fill('demo123');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    await page.waitForURL(/\/(Explore|Home)/, { timeout: 10000 });
  });

  test('MyTests sayfası', async (ctx) => {
    await expectNoA11yViolations(ctx, '/MyTests');
  });

  test('MyResults sayfası', async (ctx) => {
    await expectNoA11yViolations(ctx, '/MyResults');
  });

  test('MyTestPackages sayfası', async (ctx) => {
    await expectNoA11yViolations(ctx, '/MyTestPackages');
  });

  test('Notifications sayfası', async (ctx) => {
    await expectNoA11yViolations(ctx, '/Notifications');
  });
});

test.describe('A11y — eğitici rolü (EDUCATOR)', () => {
  test.beforeEach(async ({ page }) => {
    // Demo eğitici hesabı ile giriş (env-bağımlı; CI'da demo seed varsa)
    await page.goto('/Login');
    await page.getByPlaceholder(/ornek@email.com/i).fill('egitici@demo.com');
    await page.locator('input[type="password"]').fill('demo123');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    await page.waitForURL(/\/(Explore|Home|Dashboard)/, { timeout: 10000 });
  });

  test('EducatorDashboard', async (ctx) => {
    // Test slug ortama göre değişebilir; sayfa adı `pages.config.js` üzerinden netleşmeli
    await expectNoA11yViolations(ctx, '/EducatorDashboard');
  });

  test('CreateTest formu', async (ctx) => {
    await expectNoA11yViolations(ctx, '/CreateTest');
  });
});

test.describe('A11y — yönetici rolü (ADMIN)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Login');
    await page.getByPlaceholder(/ornek@email.com/i).fill('admin@demo.com');
    await page.locator('input[type="password"]').fill('demo123');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    await page.waitForURL(/\/(Admin|Dashboard|Home)/, { timeout: 10000 });
  });

  test('AdminDashboard', async (ctx) => {
    await expectNoA11yViolations(ctx, '/AdminDashboard');
  });

  test('AdminObjections', async (ctx) => {
    await expectNoA11yViolations(ctx, '/AdminObjections');
  });
});
