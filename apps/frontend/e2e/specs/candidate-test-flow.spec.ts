/**
 * candidate-test-flow.spec.ts
 *
 * Aday tarafı test çözme akışlarının kapsamlı UI testleri.
 *
 * Kapsanan senaryolar:
 *  1. Fresh start / IN_PROGRESS resume: TestDetail → TakeTest → soru cevapla → Bitir → Sonuç
 *  2. Kaydet ve Çık: test başlat → Kaydet ve Çık → MyTests'te paket görünür
 *  3. Resume: kaldığı yerden devam et — önceki cevaplar yüklü gelir
 *  4. Boş submit: hiç cevap vermeden Bitir → submit kabul edilir
 *
 * Demo aday'ın seed data'sı: aday@demo.com / demo123 — birkaç paketi satın almış.
 * Testler aynı kullanıcının state'ini paylaştığı için serial çalıştırılır.
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/auth';
import { execSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

// Her test'ten önce aday'ın test attempt'larını temizle — fresh state garantisi.
// Aksi takdirde önceki test'in SUBMITTED attempt'ı, sonraki teste review modunda
// açar ve UI farklı render eder (Kaydet ve Çık butonu yok, options disabled, vs).
function clearAdayAttempts() {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const aday = await p.user.findFirst({ where: { email: 'aday@demo.com' } });
      if (!aday) { await p.$disconnect(); return; }
      const ids = (await p.testAttempt.findMany({ where: { candidateId: aday.id }, select: { id: true } })).map(a => a.id);
      if (ids.length) {
        await p.attemptAnswer.deleteMany({ where: { attemptId: { in: ids } } });
        await p.testAttempt.deleteMany({ where: { id: { in: ids } } });
      }
      await p.$disconnect();
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: '../backend',
    stdio: 'inherit',
  });
}

test.beforeEach(async () => {
  clearAdayAttempts();
});

/** Çerez consent dialog'unu varsa kapat — testleri bloklar.
    Buton aria-label "Analitik dahil tüm çerezlere izin ver", visible text "Kabul et". */
async function dismissCookieDialog(page: Page) {
  const accept = page.getByRole('button', { name: /çerezlere izin|kabul et|accept/i }).first();
  if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

/** Pre-start ekranındaki 'Teste Başla' butonunu varsa tıkla — IN_PROGRESS'te yoktur.
    Click + start endpoint cevabını birlikte bekle. */
async function clickStartIfPresent(page: Page) {
  const btn = page.locator('button:has-text("Teste Başla")').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  if (await btn.isVisible().catch(() => false)) {
    // start endpoint cevabını bekleyen promise'i click'ten önce kur (race güvenli)
    const startPromise = page.waitForResponse(
      (res) => res.url().includes('/start') && res.request().method() === 'POST',
      { timeout: 15000 },
    ).catch(() => null);
    await btn.click({ timeout: 10000, force: true });
    await startPromise;
  }
}

/** İlk satın alınmış paketin ilk test'ine kadar gider, soru ekranını açar.
    NOT: TakeTest polling yaptığı için 'networkidle' bekleme HUNG kalır;
    explicit element wait'leri ile ilerle. */
async function openFirstTest(page: Page) {
  await page.goto('/MyTests');
  await dismissCookieDialog(page);
  const firstCard = page.locator('a[href*="TestDetail"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();
  await dismissCookieDialog(page);
  const firstTestLink = page.locator('a[href*="TakeTest"]').first();
  await expect(firstTestLink).toBeVisible({ timeout: 15000 });
  await firstTestLink.click();
  await dismissCookieDialog(page);
  await clickStartIfPresent(page);
  await expect(
    page.locator('h2', { hasText: /^Soru \d+$/i }).first(),
  ).toBeVisible({ timeout: 20000 });
}

test.describe('Aday — Test çözme akışı', () => {
  test('TestDetail → soru cevapla → Bitir → Sonuç ekranı', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    // İlk şıkka tıkla (A) — option buton içeriği "A" letter + içerik
    const optionA = candidatePage.locator('button:has(span:text-is("A"))').first();
    await expect(optionA).toBeVisible({ timeout: 10000 });
    await optionA.click();

    // Bitir butonunu bul
    const finishButton = candidatePage.getByRole('button', { name: /testi bitir/i }).first();
    await expect(finishButton).toBeVisible();
    await finishButton.click();

    // Onay modal'ı varsa onayla
    // Onay dialog'u şu an yok — handleFinish direkt finishMutation tetikler.

    // Sonuç ekranı bekle
    await expect(
      candidatePage.locator('text=/tamamland|sonuç|doğru|yanlış|skor/i').first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Kaydet ve Çık — MyTests sayfasına yönlendirir, paket listede kalır', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    const saveAndExit = candidatePage.getByRole('button', { name: /kaydet ve çık/i });
    await expect(saveAndExit).toBeVisible();
    await saveAndExit.click();

    // MyTests'e yönlenmeli (saveAndExit toast + 1s setTimeout sonrası navigate eder)
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Paket hâlâ listede görünüyor olmalı
    await expect(candidatePage.locator('a[href*="TestDetail"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('Resume: kaldığı yerden devam et — soru ekranı yine açılır', async ({ candidatePage }) => {
    // İlk turda 1 soru işaretle, Kaydet ve Çık
    await openFirstTest(candidatePage);
    const optionA1 = candidatePage.locator('button:has(span:text-is("A"))').first();
    await optionA1.click();
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 5000 });

    // Aynı teste geri dön
    await openFirstTest(candidatePage);

    // Soru ekranı yeniden açılmalı (en azından erişim sağlanmalı — cevap işareti
    // state restoration backend timing'ine bağlı; bu test sadece resume akışını korur)
    await expect(
      candidatePage.locator('h2').filter({ hasText: /^Soru \d+$/i }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Boş cevap bırakıp Bitir → submit kabul edilir', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    // Hiçbir şık seçmeden Bitir
    const finishButton = candidatePage.getByRole('button', { name: /testi bitir/i }).first();
    await expect(finishButton).toBeVisible();
    await finishButton.click();

    // Onay dialog'u şu an yok — handleFinish direkt finishMutation tetikler.

    // Sonuç ekranı görünmeli (0 doğru olabilir)
    await expect(
      candidatePage.locator('text=/tamamland|sonuç|skor|doğru/i').first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Sonraki/Önceki navigasyon — soru index değişir', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);
    await expect(candidatePage.locator('h2', { hasText: 'Soru 1' })).toBeVisible({ timeout: 10000 });

    const next = candidatePage.getByRole('button', { name: /^sonraki$/i }).first();
    await expect(next).toBeVisible({ timeout: 10000 });
    await next.click();
    await expect(candidatePage.locator('h2', { hasText: 'Soru 2' })).toBeVisible({ timeout: 10000 });

    const prev = candidatePage.getByRole('button', { name: /^önceki$/i }).first();
    await prev.click();
    await expect(candidatePage.locator('h2', { hasText: 'Soru 1' })).toBeVisible({ timeout: 10000 });
  });

  test('Cevap işaretle → Boş Bırak → tekrar işaretle', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    const optionA = candidatePage.locator('button:has(span:text-is("A"))').first();
    await optionA.click();

    const clearAnswer = candidatePage.getByRole('button', { name: /boş bırak/i });
    await expect(clearAnswer).toBeVisible({ timeout: 5000 });
    await clearAnswer.click();
    await expect(clearAnswer).not.toBeVisible({ timeout: 5000 });

    const optionB = candidatePage.locator('button:has(span:text-is("B"))').first();
    await optionB.click();
    await expect(clearAnswer).toBeVisible({ timeout: 5000 });
  });

  test('Half-finished resume: PAUSED teste Q3 ekle, ilk donuste Q3 gorunur', async ({ candidatePage }) => {
    // User-reported: yarım test aç, yeni cevap ekle, Kaydet ve Çık,
    // ilk dönüşte yeni cevap görünmüyordu. Fix: onSuccess flushQueue +
    // invalidate sıralaması.
    //
    // Senaryo:
    //   Session A: Q1, Q2 işaretle → Kaydet ve Çık (DB'de Q1, Q2 saved, PAUSED)
    //   Session B: Aç → resume → Q3 işaretle → ANINDA Kaydet ve Çık
    //   Session C (kritik): Aç → resume → grid'de Q1, Q2, Q3 hepsi mavi olmalı
    //     (Önceki bug: sadece Q1, Q2 görünür, Q3 yok; ikinci girişte gelir.)

    // Session A
    await openFirstTest(candidatePage);
    await candidatePage.locator('button:has(span:text-is("A"))').first().click();
    await candidatePage.waitForTimeout(200);
    await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
    await candidatePage.waitForTimeout(150);
    await candidatePage.locator('button:has(span:text-is("A"))').first().click();
    await candidatePage.waitForTimeout(500);
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Session B
    await openFirstTest(candidatePage);
    // Q3'e Sonraki x2
    await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
    await candidatePage.waitForTimeout(150);
    await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
    await candidatePage.waitForTimeout(150);
    await expect(candidatePage.locator('h2', { hasText: 'Soru 3' })).toBeVisible({ timeout: 10000 });
    // Q3 C işaretle
    await candidatePage.locator('button:has(span:text-is("C"))').first().click();
    // ANINDA Kaydet ve Çık (race)
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Session C — KRİTİK doğrulama
    await openFirstTest(candidatePage);
    // Grid'de Q1, Q2, Q3 hepsi 'bg-indigo-600' (cevaplı)
    for (let n = 1; n <= 3; n++) {
      const btn = candidatePage.locator(`button[data-nav-idx="${n - 1}"]`).first();
      await expect(btn).toBeVisible({ timeout: 10000 });
      const cls = await btn.getAttribute('class');
      expect(cls, `Q${n} grid butonu cevaplı görünmeli (bg-indigo-600)`).toContain('bg-indigo-600');
    }
  });

  test('Grid mismatch: DB Q1-Q7 cevap → ilk girişte grid Q1-Q7 mavi olmalı', async ({ candidatePage }) => {
    // Önce manuel olarak Q1-Q3 işaretle, çık. Sonra tekrar gir, Q4-Q7 işaretle, çık.
    // Üçüncü dönüşte grid'de tüm Q1-Q7'nin mavi (cevaplı) görünmesi gerekir.
    await openFirstTest(candidatePage);
    // Q1, Q2, Q3'ü işaretle (her birinde A)
    for (let i = 0; i < 3; i++) {
      await candidatePage.locator('button:has(span:text-is("A"))').first().click();
      await candidatePage.waitForTimeout(150);
      if (i < 2) {
        await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
        await candidatePage.waitForTimeout(150);
      }
    }
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // İkinci giriş: Q4-Q7 işaretle
    await openFirstTest(candidatePage);
    // Q4'e Sonraki x3
    for (let i = 0; i < 3; i++) {
      await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
      await candidatePage.waitForTimeout(150);
    }
    // Q4, Q5, Q6, Q7'yi B işaretle
    for (let i = 0; i < 4; i++) {
      await candidatePage.locator('button:has(span:text-is("B"))').first().click();
      await candidatePage.waitForTimeout(150);
      if (i < 3) {
        await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
        await candidatePage.waitForTimeout(150);
      }
    }
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Üçüncü giriş: TÜMÜNÜN cevaplı görünmesi gerekir
    await openFirstTest(candidatePage);
    // Soru grid butonu Q1: cevaplı renkte (bg-indigo-600 → white text)
    // Tüm Q1-Q7 için grid button'larında ans varsa text-white classı olur.
    // Soru gridindeki butonların inner text rakamları 1-7 — answered olanlar text-white,
    // cevapsızlar text-slate-500.
    for (let n = 1; n <= 7; n++) {
      const btn = candidatePage.locator(`button[data-nav-idx="${n - 1}"]`).first();
      await expect(btn).toBeVisible({ timeout: 10000 });
      // Class'ında bg-indigo-600 olmalı (cevaplı işareti)
      const cls = await btn.getAttribute('class');
      expect(cls).toContain('bg-indigo-600');
    }
  });

  test('Q5 spesifik: 5. soruda cevap işaretle → anında çık → dön → Q5 cevabı geri geliyor', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    // Q1 → Q5'e kadar Sonraki ile git
    for (let i = 1; i <= 4; i++) {
      await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
      await candidatePage.waitForTimeout(100);
    }
    await expect(candidatePage.locator('h2', { hasText: 'Soru 5' })).toBeVisible({ timeout: 10000 });

    // Q5'te B şıkkını seç
    await candidatePage.locator('button:has(span:text-is("B"))').first().click();
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 5000 });

    // ANINDA Kaydet ve Çık (race koşullarını test et — flush garantili)
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Tek geri dönüşte Q5'e git, cevabın hâlâ orada olduğunu doğrula
    await openFirstTest(candidatePage);
    for (let i = 1; i <= 4; i++) {
      await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
      await candidatePage.waitForTimeout(100);
    }
    await expect(candidatePage.locator('h2', { hasText: 'Soru 5' })).toBeVisible({ timeout: 10000 });
    // Q5 işaretli — 'Boş Bırak' butonu görünür olmalı
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 10000 });
  });

  test('Race fix: işaretle + ANINDA Kaydet ve Çık → flush garanti, dönüşte cevap geliyor', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    // Q1'e A işaretle, hemen (bekleme olmadan) Kaydet ve Çık
    await candidatePage.locator('button:has(span:text-is("A"))').first().click();
    // Daha önce bug: API call yetişmeden pause çağrılıyordu, cevap reject oluyordu
    // Fix: saveAndExit pause öncesi flushQueue çağırır
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Tek refresh ile cevap görünmeli (race fix). Eskiden ilk girişte cevap
    // kayıp olup ikinci girişte gelirdi.
    await openFirstTest(candidatePage);
    await expect(candidatePage.locator('h2', { hasText: 'Soru 1' })).toBeVisible({ timeout: 10000 });
    // 'Boş Bırak' butonu = answers state restore oldu
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 10000 });
  });

  test('Resume + cevap state: Soru 1 A, Soru 2 B işaretle → çık → dön → A ve B hâlâ işaretli', async ({ candidatePage }) => {
    await openFirstTest(candidatePage);

    // Soru 1'de A seç
    await candidatePage.locator('button:has(span:text-is("A"))').first().click();
    // 'Boş Bırak' butonu — A seçildi göstergesi
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 5000 });

    // Sonraki'ye git
    await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
    await expect(candidatePage.locator('h2', { hasText: 'Soru 2' })).toBeVisible({ timeout: 10000 });

    // Soru 2'de B seç
    await candidatePage.locator('button:has(span:text-is("B"))').first().click();
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 5000 });

    // Cevap submission'larının backend'e gitmesini bekle (queue var)
    await candidatePage.waitForTimeout(2000);

    // Kaydet ve Çık
    await candidatePage.getByRole('button', { name: /kaydet ve çık/i }).click();
    await candidatePage.waitForURL(/\/MyTests/i, { timeout: 10000 });

    // Aynı teste tekrar gir
    await openFirstTest(candidatePage);

    // Soru 1'de A hâlâ işaretli olmalı — 'Boş Bırak' butonu cevap seçili olduğunu gösterir
    await expect(candidatePage.locator('h2', { hasText: 'Soru 1' })).toBeVisible({ timeout: 10000 });
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 10000 });

    // Soru 2'ye git, B'nin işaretli olduğunu doğrula
    await candidatePage.getByRole('button', { name: /^sonraki$/i }).first().click();
    await expect(candidatePage.locator('h2', { hasText: 'Soru 2' })).toBeVisible({ timeout: 10000 });
    await expect(candidatePage.getByRole('button', { name: /boş bırak/i })).toBeVisible({ timeout: 10000 });
  });
});
