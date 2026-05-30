/**
 * PaymentModal testleri
 *
 * Domain: Satın alma birimi TestPackage'dır. PaymentModal her zaman
 * bir paket ID'si (test.id = packageId) ile açılır; Purchase.create'e
 * test_package_id gönderilir.
 *
 * Kapsam:
 *   - Sağlayıcı seçim adımı (select)
 *   - iyzico kart formu adımı (card)
 *   - Başarı senaryoları: iyzico, Google Pay, Amazon Pay
 *   - Hata senaryoları: genel hata, zaten satın alındı
 *   - İşlem sırasında kapatma engeli
 *   - Ücretsiz paket direkt satın alma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PaymentModal } from './PaymentModal';

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const mockPurchaseCreate = vi.fn();

vi.mock('@/api/dalClient', () => ({
  entities: {
    Purchase: {
      create: (...args) => mockPurchaseCreate(...args),
    },
  },
  // Sprint 14 — Mesafeli Satış Sözleşmesi onayı için contracts.getActive mock'u.
  // Test her açılışta DISTANCE_SALE contract'ını başarıyla fetch eder; checkbox
  // ve buton state'i `acceptedDistanceSale` ile yönetilir.
  contracts: {
    getActive: vi.fn().mockResolvedValue({
      id: 'mock-distance-sale-contract-id',
      type: 'DISTANCE_SALE',
      version: 1,
      title: 'Mesafeli Satış Sözleşmesi',
      content: 'Mock sözleşme metni',
      publishedAt: '2026-01-01T00:00:00.000Z',
    }),
  },
}));

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const DEFAULT_PACKAGE = { id: 'pkg-kpss-2026', title: 'KPSS 2026 Paketi', price: 100 };

function renderModal(props = {}) {
  const onClose = vi.fn();
  render(
    // Sprint 14 — MemoryRouter wrap: PaymentModal artık <Link> kullanıyor
    // (mesafeli satış sözleşmesi'ne route).
    <MemoryRouter>
      <QueryClientProvider client={makeQC()}>
        <PaymentModal
          isOpen={true}
          onClose={onClose}
          test={DEFAULT_PACKAGE}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { onClose };
}

/**
 * Sprint 14 — Mesafeli Satış Sözleşmesi onay checkbox'ını işaretler.
 * Çoğu test akışı için ilk adımdır; ödeme yöntemi seçilmeden önce çağrılır
 * (modal `useEffect` ile DISTANCE_SALE contract'ı async fetch ettiği için await).
 */
async function acceptContract() {
  // Mock contracts.getActive resolve olmuş, checkbox render edilmiş olmalı.
  const checkbox = await screen.findByRole('checkbox');
  fireEvent.click(checkbox);
}

/** iyzico provider butonunu tıkla (data-testid ile) */
const clickIyzico   = () => fireEvent.click(screen.getByTestId('provider-iyzico'));
const clickGoogle   = () => fireEvent.click(screen.getByTestId('provider-google_pay'));
const clickAmazon   = () => fireEvent.click(screen.getByTestId('provider-amazon_pay'));
const clickDevamEt  = () => fireEvent.click(screen.getByRole('button', { name: /devam et/i }));

async function fillCardAndPay() {
  fireEvent.click(screen.getByText('Test Kartı Doldur'));
  await waitFor(() =>
    expect(screen.getByDisplayValue('5528 7900 0000 0008')).toBeDefined()
  );
  fireEvent.click(screen.getByRole('button', { name: /güvenli öde/i }));
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('PaymentModal', () => {
  // -------------------------------------------------------------------------
  // select adımı
  // -------------------------------------------------------------------------
  describe('select adımı', () => {
    it('paket adı ve fiyatını gösterir', () => {
      renderModal();
      expect(screen.getByText('KPSS 2026 Paketi')).toBeDefined();
      expect(screen.getByText('₺100')).toBeDefined();
    });

    it('üç ödeme sağlayıcısını listeler', () => {
      renderModal();
      expect(screen.getByTestId('provider-iyzico')).toBeDefined();
      expect(screen.getByTestId('provider-google_pay')).toBeDefined();
      expect(screen.getByTestId('provider-amazon_pay')).toBeDefined();
    });

    it('sağlayıcı seçilmeden Devam Et disabled', async () => {
      renderModal();
      // Sprint 14 — Sözleşme onayı sonrası buton hâlâ disabled (provider yok)
      await acceptContract();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /ödeme yöntemi seçin/i }).disabled
        ).toBe(true)
      );
    });

    it('sağlayıcı seçince Devam Et aktif olur', async () => {
      renderModal();
      await acceptContract();
      clickGoogle();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /devam et/i }).disabled).toBe(false)
      );
    });
  });

  // -------------------------------------------------------------------------
  // iyzico kart formu
  // -------------------------------------------------------------------------
  describe('iyzico — kart formu', () => {
    async function openCard() {
      renderModal();
      // Sprint 14 — Mesafeli Satış Sözleşmesi onayı zorunlu
      await acceptContract();
      clickIyzico();
      clickDevamEt();
      await waitFor(() => expect(screen.getByText('Kart Bilgileri')).toBeDefined());
    }

    it('kart formu açılır', async () => {
      await openCard();
      expect(screen.getByPlaceholderText('0000 0000 0000 0000')).toBeDefined();
      expect(screen.getByPlaceholderText('AD SOYAD')).toBeDefined();
      expect(screen.getByPlaceholderText('AA/YY')).toBeDefined();
      expect(screen.getByPlaceholderText('000')).toBeDefined();
    });

    it('Test Kartı Doldur alanları otomatik doldurur', async () => {
      await openCard();
      fireEvent.click(screen.getByText('Test Kartı Doldur'));
      await waitFor(() => {
        expect(screen.getByDisplayValue('5528 7900 0000 0008')).toBeDefined();
        expect(screen.getByDisplayValue('TEST KULLANICI')).toBeDefined();
        expect(screen.getByDisplayValue('12/30')).toBeDefined();
      });
    });

    it('kart bilgileri eksikken Güvenli Öde disabled', async () => {
      await openCard();
      expect(screen.getByRole('button', { name: /güvenli öde/i }).disabled).toBe(true);
    });

    it('Geri butonuyla sağlayıcı seçimine dönülür', async () => {
      await openCard();
      fireEvent.click(screen.getByText(/geri/i));
      await waitFor(() =>
        expect(screen.getByText('Ödeme Yöntemi Seçin')).toBeDefined()
      );
    });
  });

  // -------------------------------------------------------------------------
  // Başarı senaryoları — her sağlayıcı
  // -------------------------------------------------------------------------
  describe('başarı senaryoları', () => {
    it('iyzico: ödeme başarılı — Purchase.create paket ID si ile çağrılır', async () => {
      mockPurchaseCreate.mockResolvedValue({ id: 'pur-1' });
      renderModal();

      await acceptContract();
      clickIyzico();
      clickDevamEt();
      await waitFor(() => expect(screen.getByText('Kart Bilgileri')).toBeDefined());
      await fillCardAndPay();

      await waitFor(() =>
        expect(screen.getByText('Satın Alma Başarılı!')).toBeDefined()
      );
      // Paketin ID'si ile çağrılmalı — ExamTest ID değil
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          test_package_id: 'pkg-kpss-2026',
          payment_provider: 'iyzico',
        })
      );
    });

    it('Google Pay: ödeme başarılı', async () => {
      mockPurchaseCreate.mockResolvedValue({ id: 'pur-2' });
      renderModal();

      await acceptContract();
      clickGoogle();
      clickDevamEt();

      await waitFor(
        () => expect(screen.getByText('Satın Alma Başarılı!')).toBeDefined(),
        { timeout: 4000 }
      );
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_provider: 'google_pay' })
      );
    });

    it('Amazon Pay: ödeme başarılı', async () => {
      mockPurchaseCreate.mockResolvedValue({ id: 'pur-3' });
      renderModal();

      await acceptContract();
      clickAmazon();
      clickDevamEt();

      await waitFor(
        () => expect(screen.getByText('Satın Alma Başarılı!')).toBeDefined(),
        { timeout: 4000 }
      );
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_provider: 'amazon_pay' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Hata senaryoları
  // -------------------------------------------------------------------------
  describe('hata senaryoları', () => {
    async function triggerIyzicoError(status, data) {
      mockPurchaseCreate.mockRejectedValue({ response: { status, data } });
      renderModal();
      // Sprint 14 — Mesafeli Satış Sözleşmesi onayı zorunlu
      await acceptContract();
      clickIyzico();
      clickDevamEt();
      await waitFor(() => expect(screen.getByText('Kart Bilgileri')).toBeDefined());
      await fillCardAndPay();
    }

    it('5xx API hatası → Ödeme Başarısız + genel mesaj', async () => {
      await triggerIyzicoError(500, { message: 'Internal error' });
      await waitFor(() => {
        expect(screen.getByText('Ödeme Başarısız')).toBeDefined();
        expect(screen.getByText(/başarısız oldu/i)).toBeDefined();
      });
    });

    it('409 ALREADY_PURCHASED → özel mesaj', async () => {
      await triggerIyzicoError(409, { code: 'ALREADY_PURCHASED' });
      await waitFor(() =>
        expect(screen.getByText(/zaten satın aldınız/i)).toBeDefined()
      );
    });

    it('403 → "yalnızca aday satın alabilir" yönlendirmesi', async () => {
      await triggerIyzicoError(403, {});
      await waitFor(() =>
        expect(screen.getByText(/sadece aday olarak kayıtlı kişiler/i)).toBeDefined()
      );
    });

    it('Tekrar Dene → sağlayıcı seçimine döner', async () => {
      await triggerIyzicoError(500, {});
      await waitFor(() => expect(screen.getByText('Ödeme Başarısız')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: /tekrar dene/i }));
      await waitFor(() =>
        expect(screen.getByText('Ödeme Yöntemi Seçin')).toBeDefined()
      );
    });
  });

  // -------------------------------------------------------------------------
  // İşlem sırasında kapatma engeli
  // -------------------------------------------------------------------------
  describe('işlem sırasında kapatma engeli', () => {
    it('processing adımında onClose çağrılmaz', async () => {
      mockPurchaseCreate.mockReturnValue(new Promise(() => {})); // asla bitmez
      const { onClose } = renderModal();

      await acceptContract();
      clickIyzico();
      clickDevamEt();
      await waitFor(() => expect(screen.getByText('Kart Bilgileri')).toBeDefined());

      // Test kartını doldur (state güncellemeleri ayrı act döngülerinde)
      await act(async () => {
        fireEvent.click(screen.getByText('Test Kartı Doldur'));
      });
      await waitFor(() =>
        expect(screen.getByDisplayValue('5528 7900 0000 0008')).toBeDefined()
      );

      // Öde — işlem başlar, processing state'e geçer
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /güvenli öde/i }));
      });

      await waitFor(() =>
        expect(screen.getByText('Ödeme İşleniyor...')).toBeDefined()
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Ücretsiz paket
  // -------------------------------------------------------------------------
  describe('ücretsiz paket', () => {
    const FREE_PKG = { id: 'pkg-free-demo', title: 'Ücretsiz Demo Paketi', price: 0 };

    it('fiyat 0 ise kart formu yerine Ücretsiz Erişim Kazan gösterilir', () => {
      renderModal({ test: FREE_PKG });
      expect(screen.getByText('Ücretsiz Erişim Kazan')).toBeDefined();
      expect(screen.queryByTestId('provider-iyzico')).toBeNull();
    });

    it('ücretsiz paket tek tıkla alınır', async () => {
      mockPurchaseCreate.mockResolvedValue({ id: 'pur-free' });
      renderModal({ test: FREE_PKG });

      // Sprint 14 — Ücretsiz pakette de mesafeli satış sözleşmesi onayı zorunlu
      // (ön bilgilendirme + kullanım koşulları kabulü tüm satın almalarda var).
      await acceptContract();
      fireEvent.click(screen.getByRole('button', { name: /ücretsiz erişim/i }));

      await waitFor(() =>
        expect(screen.getByText('Satın Alma Başarılı!')).toBeDefined()
      );
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ test_package_id: 'pkg-free-demo' })
      );
    });
  });
});
