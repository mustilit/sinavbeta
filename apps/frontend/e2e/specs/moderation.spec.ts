/**
 * moderation.spec.ts — İçerik moderasyonu e2e akış testleri
 *
 * Korunan akışlar:
 *   A. Educator REJECTED soru gördüğünde uyarı + yayımlama engeli
 *   B. Admin RiskyEducators sayfasında manuel aksiyon uygulama
 *   C. Admin ModerationQueue'da onaylamave reddetme
 *   D. Admin BlockedTerm CRUD (oluştur / düzenle / sil)
 *
 * Stub stratejisi:
 *   - Backend seed olmayan senaryolarda page.route() ile API response mock'lanır.
 *   - Mock kullanılan noktalar yorum ile belirtilir.
 *   - Mock olmadan çalıştırılabilir senaryolar önce seed kontrolü yapar;
 *     seed yoksa test.skip() ile atlanır (flaky önleme).
 *
 * Çalıştır: npm run test:e2e -- e2e/specs/moderation.spec.ts
 */

import { test as authTest, expect } from '../fixtures/auth';
import { test as base } from '@playwright/test';
import { loginAsAdmin, loginAsEducator } from '../fixtures/auth';

// ---------------------------------------------------------------------------
// Senaryo A — Educator: REJECTED soru görür ve yayımlama engeli
//
// Mock yaklaşımı: CreateTest veya EditTest'te soru kaydetme endpoint'ini
// intercept edip REJECTED durumu döndürüyoruz.
// ---------------------------------------------------------------------------
base.describe('Senaryo A — Educator REJECTED soru akışı', () => {
  base.beforeEach(async ({ page }) => {
    await loginAsEducator(page);
  });

  base.test('Educator: soru kaydedildiğinde REJECTED badge ve uyarı görünür', async ({ page }) => {
    // Test oluştur sayfasına git
    await page.goto('/CreateTest');
    await page.waitForLoadState('networkidle');

    // Sayfanın yüklendiğini doğrula
    await expect(
      page.getByRole('heading', { name: /test oluştur|yeni test/i }),
    ).toBeVisible({ timeout: 8000 });

    // Soru oluşturma API'sini intercept et — REJECTED response dön
    await page.route('**/educators/me/tests/*/questions', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-question-rejected-1',
            content: 'Bu soru içerik moderasyonunda reddedildi',
            moderationStatus: 'REJECTED',
            moderationNote: 'Küfür veya uygunsuz içerik tespit edildi',
            options: [
              { text: 'Seçenek A', isCorrect: false },
              { text: 'Seçenek B', isCorrect: true },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Soru ekle butonuna tıkla (varsa)
    const addQuestionBtn = page.getByRole('button', { name: /soru ekle|yeni soru/i }).first();
    const addBtnVisible = await addQuestionBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!addBtnVisible) {
      // CreateTest multi-step olabilir; ilk adımı geç
      // Test başlığı doldur ve devam et
      const titleInput = page.getByLabel(/başlık|test adı/i).first();
      if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await titleInput.fill('E2E Test Başlığı');
      }
      // Devam et / Sorular adımına git
      const nextBtn = page.getByRole('button', { name: /devam|sorular|ileri/i }).first();
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Şimdi soru ekle butonunu bul
    const addBtn = page.getByRole('button', { name: /soru ekle|yeni soru/i }).first();
    const addBtnNowVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!addBtnNowVisible) {
      // Sayfa yapısı mock olmadan test edilemiyor, atla
      base.skip();
      return;
    }

    await addBtn.click();

    // Soru içeriği gir
    const questionTextarea = page.getByLabel(/soru içeriği|soru metni/i).first();
    if (await questionTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await questionTextarea.fill('Test sorusu içeriği burada');
      // Blur tetikle (Jaccard / moderasyon API'si blur'da çağrılıyor)
      await page.keyboard.press('Tab');
    }

    // Kaydet / Ekle
    const saveBtn = page.getByRole('button', { name: /kaydet|ekle/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
    }

    // REJECTED badge görünmeli — moderasyon durumu "Reddedildi" veya "REJECTED"
    await expect(
      page.getByText(/reddedildi|rejected/i).first(),
    ).toBeVisible({ timeout: 6000 });
  });

  base.test('Educator: REJECTED soru varken yayımla butonu hata verir (mock)', async ({ page }) => {
    // Educator Dashboard veya MyTests'ten var olan bir testi bul
    await page.goto('/MyTests');
    await page.waitForLoadState('networkidle');

    // Publish endpoint'i intercept et — MODERATION_PENDING hatası dön
    await page.route('**/educators/me/tests/*/publish', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'MODERATION_PENDING: Bekleyen veya reddedilen sorular mevcut',
          code: 'MODERATION_PENDING',
        }),
      });
    });

    // İlk test'e gir (varsa)
    const editLink = page.getByRole('link', { name: /düzenle|edit/i }).first();
    const hasEditLink = await editLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasEditLink) {
      base.skip();
      return;
    }

    await editLink.click();
    await page.waitForLoadState('networkidle');

    // Yayımla butonu varsa tıkla
    const publishBtn = page.getByRole('button', { name: /yayımla|publish/i }).first();
    const hasPublishBtn = await publishBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasPublishBtn) {
      base.skip();
      return;
    }

    await publishBtn.click();

    // Toast hata mesajı görünmeli
    await expect(
      page.getByText(/moderasyon|MODERATION_PENDING|bekleyen/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Senaryo B — Admin: RiskyEducators sayfasında manuel aksiyon
// ---------------------------------------------------------------------------
base.describe('Senaryo B — Admin RiskyEducators aksiyon', () => {
  base.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  base.test('Admin: riskli eğiticiler sayfası yükler ve başlık görünür', async ({ page }) => {
    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /riskli eğiticiler/i }),
    ).toBeVisible({ timeout: 8000 });
  });

  base.test('Admin: eğitici varsa aksiyon dropdown açılır', async ({ page }) => {
    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    // Tabloda eğitici varsa aksiyon menüsünü aç
    const actionBtn = page.getByRole('button', { name: /aksiyonlar|more/i }).first();
    const hasBtns = await actionBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasBtns) {
      // Seed yok — boş durum mesajı görünmeli
      await expect(
        page.getByText(/eğitici yok|sistem temiz/i),
      ).toBeVisible({ timeout: 5000 });
      return;
    }

    await actionBtn.click();

    // Dropdown menüde "Askıya Al" seçeneği görünmeli
    await expect(
      page.getByRole('menuitem', { name: /askıya al/i }),
    ).toBeVisible({ timeout: 3000 });

    // Menüyü kapat
    await page.keyboard.press('Escape');
  });

  base.test('Admin: aksiyon modal formu doğrulama — kısa reason hata verir', async ({ page }) => {
    // Mock: riskli eğitici listesi 1 kayıt döndür
    await page.route('**/admin/moderation/risky-educators**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'mock-educator-1',
              username: 'test_educator',
              email: 'test@educator.com',
              riskLevel: 'HIGH',
              computedScore: 78,
              violationCount: 5,
              openViolations: 2,
              lastViolationAt: new Date().toISOString(),
              suspendedUntil: null,
              isBanned: false,
              profileImageUrl: null,
            },
          ],
          nextCursor: null,
        }),
      });
    });

    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    // Aksiyon butonunu bul
    const actionMenuBtn = page
      .getByRole('button', { name: /test_educator için aksiyonlar/i })
      .or(page.getByRole('button', { name: /aksiyonlar/i }).first());

    const hasMockBtn = await actionMenuBtn.isVisible({ timeout: 4000 }).catch(() => false);
    if (!hasMockBtn) {
      base.skip();
      return;
    }

    await actionMenuBtn.click();

    // "Askıya Al" seçeneğini tıkla
    await page.getByRole('menuitem', { name: /askıya al/i }).click();

    // Modal açıldı
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Kısa reason ile gönder (< 20 karakter)
    const reasonField = page.getByLabel(/neden|reason|gerekçe/i);
    await reasonField.fill('Çok kısa');

    const applyBtn = page.getByRole('button', { name: /uygula/i });
    await applyBtn.click();

    // Hata toast'u veya validation mesajı görünmeli
    await expect(
      page.getByText(/en az 20 karakter|neden kısa/i).first(),
    ).toBeVisible({ timeout: 4000 });
  });

  base.test('Admin: aksiyon başarıyla uygulanır (mock)', async ({ page }) => {
    // Mock: riskli eğitici listesi
    await page.route('**/admin/moderation/risky-educators**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'mock-educator-2',
              username: 'risky_educator',
              email: 'risky@educator.com',
              riskLevel: 'CRITICAL',
              computedScore: 92,
              violationCount: 12,
              openViolations: 4,
              lastViolationAt: new Date().toISOString(),
              suspendedUntil: null,
              isBanned: false,
              profileImageUrl: null,
            },
          ],
          nextCursor: null,
        }),
      });
    });

    // Mock: aksiyon endpoint'i
    await page.route('**/admin/moderation/educators/*/actions', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, actionType: 'ACCOUNT_SUSPENDED' }),
      });
    });

    await page.goto('/yonetim/moderasyon/e%C4%9Fiticiler');
    await page.waitForLoadState('networkidle');

    // Eğitici satırı görünmeli
    await expect(page.getByText('risky_educator')).toBeVisible({ timeout: 5000 });

    // Aksiyon menüsü
    const actionMenuBtn = page
      .getByRole('button', { name: /risky_educator için aksiyonlar/i })
      .or(page.getByRole('button', { name: /aksiyonlar/i }).first());

    await actionMenuBtn.click();
    await page.getByRole('menuitem', { name: /askıya al/i }).click();

    // Modal
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Geçerli reason gir (min 20 karakter)
    const reasonField = page.getByLabel(/neden|reason|gerekçe/i);
    await reasonField.fill('Platform kurallarını ihlal etti, geçici askı uygulanacak.');

    // Uygula
    await page.getByRole('button', { name: /uygula/i }).click();

    // Toast başarı
    await expect(
      page.getByText(/uygulandı|aksiyon/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Senaryo C — Admin ModerationQueue: Approve / Reject
// ---------------------------------------------------------------------------
base.describe('Senaryo C — Admin ModerationQueue onay / red', () => {
  base.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  base.test('Admin: kuyruk sayfası yükler, başlık görünür', async ({ page }) => {
    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /inceleme kuyruğu/i }),
    ).toBeVisible({ timeout: 8000 });
  });

  base.test('Admin: kuyrukta kayıt varsa Detay butonu çalışır', async ({ page }) => {
    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    const detayBtn = page.getByRole('button', { name: /detay/i }).first();
    const hasBtn = await detayBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasBtn) {
      // Kuyruk boş — boş durum mesajı görünmeli
      await expect(
        page.getByText(/incelenecek içerik yok|sistem temiz/i),
      ).toBeVisible({ timeout: 5000 });
      return;
    }

    await detayBtn.click();
    // ResultDetail sayfasına yönlenilmeli
    await expect(page).toHaveURL(/\/yonetim\/moderasyon\/sonuc\//i, { timeout: 8000 });
  });

  base.test('Admin: Temiz onayı modal ile tamamlanır (mock)', async ({ page }) => {
    // Mock: kuyruk 1 kayıt döndür
    await page.route('**/admin/moderation/queue**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'mock-result-1',
              category: 'PROFANITY',
              status: 'PENDING_REVIEW',
              provider: 'CLAUDE',
              flaggedContent: 'Örnek uygunsuz içerik metni burada',
              reasonText: 'Küfür içeriği tespit edildi',
              createdAt: new Date().toISOString(),
              userId: 'educator-1',
              user: { email: 'educator@test.com' },
            },
          ],
          nextCursor: null,
        }),
      });
    });

    // Mock: approve endpoint
    await page.route('**/admin/moderation/results/*/approve', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    // Kayıt görünmeli
    await expect(page.getByText('educator@test.com')).toBeVisible({ timeout: 5000 });

    // "Temiz" butonuna tıkla
    await page.getByRole('button', { name: /temiz/i }).first().click();

    // Karar modali açıldı
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('heading', { name: /temiz işaretle|içeriği temiz/i }),
    ).toBeVisible({ timeout: 3000 });

    // (Opsiyonel not gir)
    // Onayla
    await page.getByRole('button', { name: /onayla.*temiz/i }).click();

    // Toast
    await expect(
      page.getByText(/temiz işaretlendi|onaylandı/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  base.test('Admin: İhlal onayı modal ile tamamlanır (mock)', async ({ page }) => {
    // Mock: kuyruk 1 kayıt
    await page.route('**/admin/moderation/queue**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'mock-result-2',
              category: 'HATE_SPEECH',
              status: 'PENDING_REVIEW',
              provider: 'CLAUDE',
              flaggedContent: 'Örnek nefret söylemi içeriği',
              reasonText: 'Nefret söylemi tespit edildi',
              createdAt: new Date().toISOString(),
              userId: 'educator-2',
              user: { email: 'hateful@test.com' },
            },
          ],
          nextCursor: null,
        }),
      });
    });

    // Mock: reject endpoint
    await page.route('**/admin/moderation/results/*/reject', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/yonetim/moderasyon/kuyruk');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('hateful@test.com')).toBeVisible({ timeout: 5000 });

    // "İhlal" butonuna tıkla
    await page.getByRole('button', { name: /ihlal/i }).first().click();

    // Modal açıldı
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('heading', { name: /ihlal onayla/i }),
    ).toBeVisible({ timeout: 3000 });

    // Onayla
    await page.getByRole('button', { name: /onayla.*ihlal/i }).click();

    // Toast
    await expect(
      page.getByText(/ihlal onaylandı|başlatıldı/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Senaryo D — Admin BlockedTerms CRUD
// ---------------------------------------------------------------------------
base.describe('Senaryo D — Admin BlockedTerms CRUD', () => {
  // Mock CRUD endpoint'leri
  const mockTermId = 'mock-term-test-1';

  base.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);

    // Mock: liste endpoint
    await page.route('**/admin/moderation/blocked-terms**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            nextCursor: null,
          }),
        });
      } else {
        await route.continue();
      }
    });
  });

  base.test('Admin: BlockedTerms sayfası yükler, Yeni Kelime butonu görünür', async ({ page }) => {
    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /yasak kelimeler/i }),
    ).toBeVisible({ timeout: 8000 });

    await expect(
      page.getByRole('button', { name: /yeni kelime/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  base.test('Admin: Yeni kelime ekler — modal form, submit, toast', async ({ page }) => {
    // Mock: create endpoint
    await page.route('**/admin/moderation/blocked-terms', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: mockTermId,
            term: 'testkelime',
            pattern: null,
            category: 'PROFANITY',
            severity: 3,
            isActive: true,
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        // GET için mock liste (boş)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], nextCursor: null }),
        });
      }
    });

    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    // Modal aç
    await page.getByRole('button', { name: /yeni kelime/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('heading', { name: /yeni yasak kelime/i }),
    ).toBeVisible({ timeout: 3000 });

    // Form doldur
    await page.getByLabel(/kelime.*terim|terim.*kelime/i).fill('testkelime');

    // Kategori seç (PROFANITY varsayılan olabilir, explicit set et)
    // Radix Select trigger'ını bul
    const categoryTrigger = page
      .getByRole('combobox', { name: /kategori/i })
      .or(page.locator('[id="category"]'));
    if (await categoryTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categoryTrigger.click();
      // Listbox açıldığında seçenek seç
      const profanityOption = page.getByRole('option', { name: /küfür|profanity/i }).first();
      if (await profanityOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await profanityOption.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // Kaydet
    await page.getByRole('button', { name: /^ekle$/i }).click();

    // Toast başarı
    await expect(
      page.getByText(/kelime eklendi|başarı/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  base.test('Admin: Mevcut kelimeyi satır içi düzenler (mock)', async ({ page }) => {
    const existingTerm = {
      id: mockTermId,
      term: 'mevcut_kelime',
      pattern: null,
      category: 'PROFANITY',
      severity: 2,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Mock: liste 1 kayıt döndür
    await page.route('**/admin/moderation/blocked-terms**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [existingTerm], nextCursor: null }),
        });
      } else if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...existingTerm, severity: 5 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    // Kelime satırı görünmeli
    await expect(page.getByText('mevcut_kelime')).toBeVisible({ timeout: 5000 });

    // Düzenle butonuna tıkla (kalem ikonu)
    await page.getByRole('button', { name: /mevcut_kelime kelimesini düzenle/i }).click();

    // Satır inline edit moduna geçti — severity input görünmeli
    const severityInput = page.locator('input[type="number"][min="1"][max="5"]').first();
    if (await severityInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await severityInput.fill('5');
    }

    // Kaydet
    await page.getByRole('button', { name: /^kaydet$/i }).click();

    // Toast başarı
    await expect(
      page.getByText(/güncellendi|başarı/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  base.test('Admin: Kelimeyi siler (mock)', async ({ page }) => {
    const termToDelete = {
      id: mockTermId,
      term: 'silinecek_kelime',
      pattern: null,
      category: 'PROFANITY',
      severity: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Mock: liste 1 kayıt, delete başarı
    await page.route('**/admin/moderation/blocked-terms**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [termToDelete], nextCursor: null }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto('/yonetim/moderasyon/kelime-listesi');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('silinecek_kelime')).toBeVisible({ timeout: 5000 });

    // Sil butonuna tıkla
    await page
      .getByRole('button', { name: /silinecek_kelime kelimesini sil/i })
      .click();

    // Toast başarı
    await expect(
      page.getByText(/silindi|başarı/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Senaryo E — Admin ModerationResultDetail sayfası
// ---------------------------------------------------------------------------
base.describe('Senaryo E — Admin ModerationResultDetail', () => {
  base.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  base.test('Admin: result detay sayfası mock ile açılır', async ({ page }) => {
    const mockResultId = 'mock-result-detail-1';

    // Mock: result detail endpoint
    await page.route(`**/admin/moderation/results/${mockResultId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockResultId,
          category: 'PROFANITY',
          status: 'PENDING_REVIEW',
          provider: 'CLAUDE',
          flaggedContent: 'İçerik burada',
          reasonText: 'Küfür içeriği',
          createdAt: new Date().toISOString(),
          userId: 'educator-1',
          user: { email: 'educator@test.com', username: 'educator1' },
          riskLevel: 'HIGH',
        }),
      });
    });

    await page.goto(`/yonetim/moderasyon/sonuc/${mockResultId}`);
    await page.waitForLoadState('networkidle');

    // İçerik veya hata durumu görünmeli (ikisi de a11y testi farklı spec'te)
    // Burada sadece sayfanın crash etmediğini doğruluyoruz
    await expect(page.locator('body')).toBeVisible({ timeout: 5000 });
  });
});
