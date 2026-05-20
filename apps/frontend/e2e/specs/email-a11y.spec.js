/**
 * email-a11y.spec.js — Email modülü a11y testleri
 *
 * Kapsam:
 * - Public: Unsubscribe sayfası (token query param ile)
 * - Auth (smoke fixture'ı yoksa skip) — bu spec sadece public Unsubscribe sayfasını test eder.
 *   Auth gerektiren admin email sayfaları daha sonra ayrı bir fixture ile eklenmelidir.
 *
 * Çalıştır: npm run test:e2e -- e2e/specs/email-a11y.spec.js
 */
import { test, expect } from '../fixtures/axe.js';

test.describe('A11y — Email Modülü Public', () => {
  test('Unsubscribe — token query param ile', async ({ page, makeAxeBuilder }) => {
    // Geçersiz token gönder — sayfa hata UI rendere edecek
    await page.goto('/Unsubscribe?token=invalid-token');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    if (results.violations.length > 0) {
      console.log(
        'Email Unsubscribe violations:',
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, description: v.description, nodes: v.nodes.length })),
          null,
          2,
        ),
      );
    }
    expect(results.violations).toEqual([]);
  });

  test('Unsubscribe — token yoksa hata mesajı erişilebilir', async ({ page, makeAxeBuilder }) => {
    await page.goto('/Unsubscribe');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
});
