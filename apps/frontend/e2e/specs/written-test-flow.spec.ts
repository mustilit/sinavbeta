/**
 * written-test-flow.spec.ts — Yazılı (açık uçlu) test modülü uçtan uca.
 *
 * Seed: seed-e2e.cjs "E2E Yazılı Test Paketi" (yayımlı, demo educator) + aday@demo.com
 * için ACTIVE satın alma + 2 çözümlü soru.
 *
 * Kapsanan:
 *  1. Aday: Keşfet → "Yazılı Testler" sekmesi → paket görünür
 *  2. Aday: Detay → Başla → metin cevap yaz → Çözümü Gör → Testi Bitir → öz-kıyas
 *  3. Aday: Sonuçlarım → "Yazılı Testler" sekmesi → paket görünür
 *  4. Eğitici: Yazılı Testlerim → paket + "Yeni Yazılı Test" butonu
 *
 * Çözme aday state'i paylaştığı için serial.
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/auth';
import { execSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

/** aday@demo.com yazılı denemelerini temizle — fresh çözme state'i. Satın alma korunur. */
function clearAdayWritten() {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const aday = await p.user.findFirst({ where: { email: 'aday@demo.com' } });
      if (!aday) { await p.$disconnect(); return; }
      const ids = (await p.writtenAttempt.findMany({ where: { candidateId: aday.id }, select: { id: true } })).map(a => a.id);
      if (ids.length) {
        await p.writtenAnswer.deleteMany({ where: { attemptId: { in: ids } } });
        await p.writtenAttempt.deleteMany({ where: { id: { in: ids } } });
      }
      await p.$disconnect();
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  try {
    execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { cwd: '../backend', stdio: 'inherit' });
  } catch { /* CI dışı / DB erişimi yoksa atla — test yine de resume ile çalışır */ }
}

async function dismissCookie(page: Page) {
  const accept = page.getByRole('button', { name: /çerezlere izin|kabul et|accept/i }).first();
  if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) await accept.click();
}

test.describe('Yazılı Test — uçtan uca', () => {
  test('Aday: Keşfet → Yazılı Testler sekmesi → paket görünür', async ({ candidatePage }) => {
    await candidatePage.goto('/Explore');
    await dismissCookie(candidatePage);
    await candidatePage.getByRole('button', { name: 'Yazılı Testler' }).click();
    await expect(candidatePage.getByText('E2E Yazılı Test Paketi').first()).toBeVisible({ timeout: 15000 });
  });

  test('Aday: Detay → Başla → metin cevap → Çözümü Gör → Bitir → öz-kıyas', async ({ candidatePage }) => {
    clearAdayWritten();
    // Keşfet → yazılı sekme → karta tıkla
    await candidatePage.goto('/Explore');
    await dismissCookie(candidatePage);
    await candidatePage.getByRole('button', { name: 'Yazılı Testler' }).click();
    await candidatePage.getByText('E2E Yazılı Test Paketi').first().click();

    // Detay → Başla (satın alma seed'li)
    const start = candidatePage.getByRole('button', { name: /^Başla$|Devam Et|İncele/ }).first();
    await expect(start).toBeVisible({ timeout: 15000 });
    await start.click();

    // Çözme ekranı: metin alanı
    const textarea = candidatePage.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 20000 });
    await textarea.fill('Fotosentez bitkilerin ışıkla besin üretmesidir.');
    await candidatePage.waitForTimeout(1000); // autosave debounce

    // Çözümü Gör
    await candidatePage.getByRole('button', { name: /Çözümü Gör/i }).click();
    await expect(candidatePage.getByText(/Fotosentezi/i).first()).toBeVisible({ timeout: 10000 });

    // Testi Bitir → window.confirm accept
    candidatePage.once('dialog', (d) => d.accept());
    await candidatePage.getByRole('button', { name: /Testi Bitir/i }).click();

    // Teslim sonrası öz-kıyas bandı
    await expect(candidatePage.getByText(/Test tamamlandı/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('Aday: Sonuçlarım → Yazılı Testler sekmesi → paket görünür', async ({ candidatePage }) => {
    await candidatePage.goto('/MyResults');
    await dismissCookie(candidatePage);
    await candidatePage.getByRole('button', { name: 'Yazılı Testler' }).click();
    await expect(candidatePage.getByText('E2E Yazılı Test Paketi').first()).toBeVisible({ timeout: 15000 });
  });

  test('Eğitici: Yazılı Testlerim → paket + Yeni Yazılı Test', async ({ educatorPage }) => {
    await educatorPage.goto('/ManageWrittenTests');
    await dismissCookie(educatorPage);
    await expect(educatorPage.getByRole('button', { name: /Yeni Yazılı Test/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(educatorPage.getByText('E2E Yazılı Test Paketi').first()).toBeVisible({ timeout: 15000 });
  });
});
