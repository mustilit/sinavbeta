/**
 * WrittenPackageGrid — yazili paket izgarasi (discover/mine) testleri.
 *
 * Kapsam:
 *   1. Discover: yayimli paketleri listeler (mevcut)
 *   2. Mine: satin alinan paketleri listeler (mevcut)
 *   3. Bos durumda mesaj gosterir (mevcut)
 *   4. Discover: satin alinan pakete "Satin Alindi" gosterir, "Satin Al" degil (yeni — regression)
 *   5. Discover: satin alinmayan pakete "Satin Al" butonu gosterir (yeni)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts && opts.defaultValue) || key,
    i18n: { language: 'tr', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }) => children,
}));

vi.mock('@/api/dalClient', () => ({
  candidateWritten: {
    listPackages: vi.fn(),
    myPackages: vi.fn(),
  },
  entities: {
    GradeLevel: {
      filter: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/components/ui/PaymentModal', () => ({
  PaymentModal: () => null,
}));

import { candidateWritten } from '@/api/dalClient';
import { WrittenPackageGrid } from '@/components/written/WrittenPackageGrid';

function renderGrid(mode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WrittenPackageGrid mode={mode} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('WrittenPackageGrid', () => {
  it('discover: yayimli paketleri listeler', async () => {
    candidateWritten.listPackages.mockResolvedValue({
      items: [{ id: 'p1', title: 'Kompozisyon Seti', priceCents: 5000, testCount: 2, educatorName: 'Egitmen A' }],
    });
    candidateWritten.myPackages.mockResolvedValue({ items: [] });
    renderGrid('discover');
    expect(await screen.findByText('Kompozisyon Seti')).toBeTruthy();
    expect(candidateWritten.listPackages).toHaveBeenCalled();
  });

  it('mine: satin alinan paketleri listeler', async () => {
    candidateWritten.myPackages.mockResolvedValue({
      items: [{ packageId: 'p2', title: 'Tarih Yazili', tests: [{ id: 't1' }], educatorName: 'Egitmen B' }],
    });
    renderGrid('mine');
    expect(await screen.findByText('Tarih Yazili')).toBeTruthy();
    expect(candidateWritten.myPackages).toHaveBeenCalled();
  });

  it('bos durumda mesaj gosterir', async () => {
    candidateWritten.listPackages.mockResolvedValue({ items: [] });
    candidateWritten.myPackages.mockResolvedValue({ items: [] });
    const { container } = renderGrid('discover');
    await waitFor(() => expect(container.querySelector('p')).toBeTruthy());
  });

  it('discover: satin alinan pakete "Satin Alindi" etiketi gosterir, "Satin Al" degil (regression)', async () => {
    // Arrange — p1 marketplace'de gorunur, ayni zamanda ownedData'da var
    candidateWritten.listPackages.mockResolvedValue({
      items: [
        { id: 'p1', title: 'Aldigim Paket', priceCents: 3000, testCount: 1, educatorName: 'Egitmen' },
        { id: 'p2', title: 'Almadigim Paket', priceCents: 2000, testCount: 1, educatorName: 'Egitmen' },
      ],
    });
    candidateWritten.myPackages.mockResolvedValue({
      items: [
        { packageId: 'p1', title: 'Aldigim Paket', tests: [{ id: 't1', state: 'IN_PROGRESS' }] },
      ],
    });

    // Act
    renderGrid('discover');

    // Assert
    await waitFor(() => expect(screen.getByText('Aldigim Paket')).toBeInTheDocument());
    expect(screen.getByText('Almadigim Paket')).toBeInTheDocument();

    // Satin Alindi etiketi gorunur (purchased=true olan kart)
    expect(screen.getByText('pages:writtenGrid.purchasedLabel')).toBeInTheDocument();

    // Satin Al butonu yalniz alinmamis paket icin gorunur
    const buyButtons = screen.getAllByText('pages:testCard.buy');
    expect(buyButtons).toHaveLength(1);
  });

  it('discover: satin alinmayan pakete fiyat + "Satin Al" butonu gosterir', async () => {
    // Arrange — hicbir paket satin alinmamis
    candidateWritten.listPackages.mockResolvedValue({
      items: [
        { id: 'p3', title: 'Yeni Paket', priceCents: 4500, testCount: 3, educatorName: 'Egitmen C' },
      ],
    });
    candidateWritten.myPackages.mockResolvedValue({ items: [] });

    // Act
    renderGrid('discover');

    // Assert
    await waitFor(() => expect(screen.getByText('Yeni Paket')).toBeInTheDocument());

    // Satin Al butonu gorunur
    expect(screen.getByText('pages:testCard.buy')).toBeInTheDocument();

    // Satin Alindi etiketi yok
    expect(screen.queryByText('pages:writtenGrid.purchasedLabel')).not.toBeInTheDocument();
  });
});
