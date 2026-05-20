/**
 * axe.ts — axe-core Playwright fixture
 *
 * makeAxeBuilder: WCAG 2.1 AA kurallarını kapsar.
 * Üçüncü taraf iframe'ler (Stripe, iyzipay) otomatik hariç tutulur.
 * disableRules() YALNIZCA gerekçeli yorumla kullanılabilir.
 */
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

type AxeBuilderOpts = {
  page?: Page;
};

type AxeFixtures = {
  makeAxeBuilder: (opts?: AxeBuilderOpts) => AxeBuilder;
};

export const test = base.extend<AxeFixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    const builder = (opts: AxeBuilderOpts = {}) =>
      new AxeBuilder({ page: opts.page ?? page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Üçüncü taraf ödeme widget'ları — kendi a11y sözleşmeleri var
        .exclude('iframe[src*="stripe.com"]')
        .exclude('iframe[src*="iyzipay.com"]');

    await use(builder);
  },
});

export { expect };
