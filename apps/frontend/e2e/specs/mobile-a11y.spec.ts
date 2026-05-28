/**
 * mobile-a11y.spec.ts — 360px (Galaxy S5) + iPhone 12 dar viewport regresyonları.
 *
 * Sprint 11 #5 — Mobile UX kalite kapısı. Bu spec yalnızca
 * `mobile-360` ve `mobile-iphone` projelerinde çalışır (playwright.config.js).
 *
 * KAPSAM:
 *   - axe-core WCAG AA — mobile viewport'ta da temiz
 *   - Yatay scroll yasak (`document.documentElement.scrollWidth <= clientWidth + 1`)
 *   - Touch target boyutu — interaktif elementler en az 40x40 (WCAG 2.5.5 Level AAA
 *     hedefi 44px; biz Level AA AAA-near-miss 40 kabul ediyoruz, Tailwind h-10/p-2
 *     buton standartına uyumlu).
 *   - Skip-link tab ile erişilebilir mi
 *
 * NOT: Bu spec içeriği oturum gerektirmiyor — public sayfalar. Aday/educator için
 * ileride genişletilebilir.
 */

import { test, expect } from '../fixtures/axe';

const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'Login', path: '/Login' },
  { name: 'Register', path: '/Register' },
  { name: 'Explore', path: '/Explore' },
];

for (const p of PAGES) {
  test.describe(`mobile a11y — ${p.name}`, () => {
    test(`${p.name}: axe-core WCAG AA temiz`, async ({ page, makeAxeBuilder }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      const results = await makeAxeBuilder({ page }).analyze();
      if (results.violations.length) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify(
            results.violations.map((v) => ({
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
      expect(results.violations).toEqual([]);
    });

    test(`${p.name}: yatay scroll yok`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // 1px tolerans — sub-pixel rendering bazen 1 fazla verir.
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        return html.scrollWidth - html.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`${p.name}: tıklanabilir öğeler ≥ 40x40 (touch target)`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // Görünür buton/link'lerin bbox'larını topla. `display:none` veya
      // viewport dışındakileri sayma.
      const violations = await page.evaluate(() => {
        const MIN = 40;
        const out: { tag: string; w: number; h: number; text: string }[] = [];
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a[href], input[type="button"], input[type="submit"], [role="button"]',
          ),
        );
        for (const el of nodes) {
          // Görünür mü?
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (style.pointerEvents === 'none') continue;
          // Skip link gibi sr-only öğeler focus'ta büyür, statikte 1px — bunları
          // boyut testinden hariç tut.
          if (r.width < 4 && r.height < 4) continue;
          // Görünür alanın bir parçası DEĞİL — viewport dışı (ör. açılır menü
          // kapalıyken DOM'da olabilir).
          if (r.bottom < 0 || r.right < 0) continue;

          if (r.width < MIN || r.height < MIN) {
            out.push({
              tag: el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              text: (el.textContent ?? '').trim().slice(0, 40),
            });
          }
        }
        return out;
      });

      // Sprint 12 #3 — STRICT assertion. Button component default 40px;
      // tüm size variantları min-h-10 ile garanti altında. Yeni component
      // ≤ 40 buton üretirse CI kırmızıya döner.
      if (violations.length) {
        // eslint-disable-next-line no-console
        console.log(`Küçük touch target'lar (${p.name}):`, JSON.stringify(violations, null, 2));
      }
      expect(violations).toEqual([]);
    });
  });
}

test.describe('mobile — skip link', () => {
  test('Tab ile "Ana içeriğe atla" link görünür hale gelir', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // İlk Tab → skip link focus alır. Bazı layout'larda dil seçici/skip link
    // sırası değişebilir; ilk 3 Tab'da skip link odakta olsun.
    let skipFound = false;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().toLowerCase(),
          href: (el as HTMLAnchorElement).href ?? null,
        };
      });
      if (focused?.tag === 'a' && /ana içeriğe|skip|main/i.test(focused.text)) {
        skipFound = true;
        break;
      }
    }
    expect(skipFound).toBe(true);
  });
});
