/**
 * BasePage — tüm Page Object'lerin ortak atası (Sprint 17.1 Foundation)
 *
 * Sınav Salonu UI invariant'larına göre yazılmış evrensel yardımcılar:
 *  - Çerez consent dialog'u kapatma
 *  - Sonner/Toaster toast okuma (success/error)
 *  - Sayfa navigasyonu (createPageUrl konvansiyonu: /<PageName>)
 *  - Yatay scroll guard (mobil regresyon)
 *  - Yükleme spinner'ı bekleme
 *
 * Selector stratejisi: getByRole / getByLabel öncelikli, data-testid son çare
 * (accessibility skill ile tutarlı).
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /** /<PageName> rotasına git (React Router createPageUrl konvansiyonu) */
  async goto(pageName: string, query = ''): Promise<void> {
    const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    await this.page.goto(`/${pageName}${q}`);
    await this.dismissCookieDialog();
  }

  /** Çerez consent dialog'unu varsa kapat (testleri bloklar) */
  async dismissCookieDialog(): Promise<void> {
    const accept = this.page
      .getByRole('button', { name: /çerezlere izin|kabul et|accept|tümüne izin/i })
      .first();
    if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) {
      await accept.click();
      await this.page.waitForTimeout(200);
    }
  }

  /** Sonner success toast metnini bekle ve doğrula */
  async expectSuccessToast(textRe?: RegExp): Promise<void> {
    const toast = this.page.locator('[data-sonner-toast][data-type="success"]').first();
    await expect(toast).toBeVisible({ timeout: 8000 });
    if (textRe) await expect(toast).toContainText(textRe);
  }

  /** Sonner error toast metnini bekle ve doğrula */
  async expectErrorToast(textRe?: RegExp): Promise<void> {
    const toast = this.page.locator('[data-sonner-toast][data-type="error"]').first();
    await expect(toast).toBeVisible({ timeout: 8000 });
    if (textRe) await expect(toast).toContainText(textRe);
  }

  /** Herhangi bir toast (success/error) metnini döndür — esnek assertion için */
  async readAnyToast(): Promise<string | null> {
    const toast = this.page.locator('[data-sonner-toast]').first();
    if (await toast.isVisible({ timeout: 5000 }).catch(() => false)) {
      return (await toast.textContent())?.trim() ?? null;
    }
    return null;
  }

  /** Yükleme spinner'ı kaybolana kadar bekle (network idle proxy) */
  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  /** 360px viewport'ta yatay scroll olmamalı (mobil regresyon guard) */
  async assertNoHorizontalScroll(): Promise<void> {
    const overflow = await this.page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }

  /** Rol bazlı redirect'i bekle — onay aşaması eğitici EducatorSettings'e iner */
  async expectRedirectedTo(pageName: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname.includes(pageName), { timeout: 10000 });
  }

  /** İsme göre buton locator (case-insensitive, kısmi) */
  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', {
      name: typeof name === 'string' ? new RegExp(name, 'i') : name,
    });
  }

  /** İsme göre link locator */
  link(name: string | RegExp): Locator {
    return this.page.getByRole('link', {
      name: typeof name === 'string' ? new RegExp(name, 'i') : name,
    });
  }

  /** Label'a göre input doldur */
  async fillByLabel(label: string | RegExp, value: string): Promise<void> {
    await this.page
      .getByLabel(typeof label === 'string' ? new RegExp(label, 'i') : label)
      .first()
      .fill(value);
  }
}
