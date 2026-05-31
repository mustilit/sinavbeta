/**
 * legal-documents.spec.ts (Sprint 17.7 — Yasal metinler, public)
 *
 * Sprint 14 — 4 yasal sözleşme public sayfada markdown render edilir.
 * Login gerekmez (footer'dan + kayıt/satın alma akışından erişilir).
 *
 * Slug'lar: uyelik (CANDIDATE), kvkk (PRIVACY), mesafeli-satis (DISTANCE_SALE),
 * egitici-hizmet (EDUCATOR).
 */
import { test } from '../fixtures/auth';
import { expect } from '@playwright/test';

const SLUGS = [
  { slug: 'uyelik', label: 'Üyelik' },
  { slug: 'kvkk', label: 'KVKK' },
  { slug: 'mesafeli-satis', label: 'Mesafeli Satış' },
  { slug: 'egitici-hizmet', label: 'Eğitici Hizmet' },
];

test.describe('Yasal metinler — public sözleşme sayfaları', () => {
  for (const { slug, label } of SLUGS) {
    test(`/sozlesmeler/${slug} login'siz açılır + içerik render eder`, async ({ page }) => {
      await page.goto(`/sozlesmeler/${slug}`);
      // Login'e yönlenmemeli (public)
      await expect(page).not.toHaveURL(/\/Login/i, { timeout: 8000 });
      // Markdown içerik render olmalı — en az bir başlık + anlamlı metin
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8000 });
      // Sayfa boş değil (markdown gövdesi var)
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(200);
    });
  }

  test('geçersiz slug → kırılmadan ele alınır', async ({ page }) => {
    await page.goto('/sozlesmeler/gecersiz-slug-xyz');
    // Crash yok — sayfa bir şey render eder (hata mesajı veya boş state)
    await expect(page.locator('body')).toBeVisible({ timeout: 6000 });
  });
});
