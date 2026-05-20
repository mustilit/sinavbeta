/**
 * a11y.spec.ts — WCAG 2.1 AA erişilebilirlik testleri
 *
 * Kapsam:
 *   - Public sayfalar: Home, Login, Register, Explore
 *   - Admin moderasyon sayfaları: ModerationQueue, RiskyEducators,
 *     BlockedTerms, ModerationSettings, EducatorViolationDetail
 *   - Educator moderasyon sayfası: MyModerationStatus
 *   - Modal açıkken a11y snapshot (ModerationQueue karar modali)
 *
 * disableRules() KULLANILMIYOR — gerekçesiz kural kapatma sessiz regresyon yaratır.
 * Üçüncü taraf ödeme iframe'leri axe fixture'da zaten hariç tutulur.
 *
 * Çalıştır: npm run test:e2e -- e2e/specs/a11y.spec.ts
 */

import { test, expect } from '../fixtures/axe';
import { loginAsAdmin, loginAsEducator } from '../fixtures/auth';

// ---------------------------------------------------------------------------
// Yardımcı: violations varsa okunabilir log
// ---------------------------------------------------------------------------
function reportViolations(
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    nodes: Array<{ target: unknown[] }>;
  }>,
): void {
  if (violations.length === 0) return;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.target),
      })),
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// PUBLIC sayfalar — giriş gerekmez
// ---------------------------------------------------------------------------
test.describe('a11y — public sayfalar (WCAG 2.1 AA)', () => {
  test('Home ana sayfa', async ({ page, makeAxeBuilder }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('Login formu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/Login');
    await expect(page.getByRole('heading', { name: /giriş yap/i })).toBeVisible({ timeout: 5000 });

    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('Register formu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/Register');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('Explore test listesi', async ({ page, makeAxeBuilder }) => {
    await page.goto('/Explore');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('Educators listesi', async ({ page, makeAxeBuilder }) => {
    await page.goto('/Educators');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder().analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Auth gerektiren — aday (candidate) sayfalar
// ---------------------------------------------------------------------------
test.describe('a11y — aday sayfaları (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Login');
    await page.getByLabel(/e-posta/i).fill('aday@demo.com');
    await page.getByLabel(/şifre/i).fill('demo123');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    await page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
      timeout: 12000,
    });
  });

  test('MyTests — test listem', async ({ page, makeAxeBuilder }) => {
    await page.goto('/MyTests');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('MyResults — sonuçlarım', async ({ page, makeAxeBuilder }) => {
    await page.goto('/MyResults');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Admin — İçerik moderasyonu sayfaları (Phase 8)
// ---------------------------------------------------------------------------
test.describe('a11y — admin moderasyon sayfaları (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('ModerationQueue — inceleme kuyruğu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('RiskyEducators — riskli eğiticiler listesi', async ({ page, makeAxeBuilder }) => {
    // URL'de Türkçe karakter — encode edilmiş haliyle git
    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('BlockedTerms — yasak kelimeler listesi', async ({ page, makeAxeBuilder }) => {
    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('ModerationSettings — moderasyon ayarları formu', async ({ page, makeAxeBuilder }) => {
    await page.goto('/yonetim/moderasyon/ayarlar');
    await expect(
      page.getByRole('heading', { name: /moderasyon ayarları/i }),
    ).toBeVisible({ timeout: 8000 });

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('EducatorViolationDetail — eğitici ihlal detay sayfası', async ({
    page,
    makeAxeBuilder,
  }) => {
    // Önce riskli eğitici listesine git
    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    // Tabloda "Detayı Gör" linki varsa tıkla; yoksa hata durumu da a11y açısından doğru olmalı
    const detailLink = page.getByRole('link', { name: /detayı gör/i }).first();
    const linkVisible = await detailLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (linkVisible) {
      await detailLink.click();
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: /ihlal geçmişi/i }),
      ).toBeVisible({ timeout: 8000 });
    } else {
      // Seed yoksa — bilinmeyen id ile hata durumunu test et (error card da a11y uyumlu olmalı)
      await page.goto('/yonetim/moderasyon/e%C4%9Fitici/nonexistent-id');
      await page.waitForLoadState('networkidle');
    }

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });

  test('ModerationQueue — karar modali açıkken a11y', async ({ page, makeAxeBuilder }) => {
    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    // Kuyrukta kayıt varsa "Temiz" butonuna bas, modali aç
    const temizBtn = page.getByRole('button', { name: /temiz/i }).first();
    const btnVisible = await temizBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!btnVisible) {
      // Kuyruk boş — boş durum ekranı zaten başka testten geçti, bu testi atla
      test.skip();
      return;
    }

    await temizBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Modal açıkken axe taraması
    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);

    // Modal Escape ile kapanıyor mu? (klavye erişilebilirliği)
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
  });

  test('BlockedTerms — yeni kelime modali açıkken a11y', async ({ page, makeAxeBuilder }) => {
    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    // "+ Yeni Kelime" butonuna tıkla
    await page.getByRole('button', { name: /yeni kelime/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);

    // Escape ile kapat
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Educator — kendi moderasyon durumu sayfası
// ---------------------------------------------------------------------------
test.describe('a11y — educator moderasyon sayfası (WCAG 2.1 AA)', () => {
  test('MyModerationStatus — içerik durumum', async ({ page, makeAxeBuilder }) => {
    await loginAsEducator(page);
    await page.goto('/egitici/icerik-durumu');
    await page.waitForLoadState('networkidle');

    const results = await makeAxeBuilder({ page }).analyze();
    reportViolations(results.violations);
    expect(results.violations).toEqual([]);
  });
});
