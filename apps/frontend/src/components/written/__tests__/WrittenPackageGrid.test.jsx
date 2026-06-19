/**
 * WrittenPackageGrid — yazılı paket ızgarası (discover/mine) testleri.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/dalClient', () => ({
  candidateWritten: {
    listPackages: vi.fn(),
    myPackages: vi.fn(),
  },
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
  it('discover: yayımlı paketleri listeler', async () => {
    candidateWritten.listPackages.mockResolvedValue({
      items: [{ id: 'p1', title: 'Kompozisyon Seti', priceCents: 5000, testCount: 2, educatorName: 'Eğitmen A' }],
    });
    renderGrid('discover');
    expect(await screen.findByText('Kompozisyon Seti')).toBeTruthy();
    expect(candidateWritten.listPackages).toHaveBeenCalled();
  });

  it('mine: satın alınan paketleri listeler', async () => {
    candidateWritten.myPackages.mockResolvedValue({
      items: [{ packageId: 'p2', title: 'Tarih Yazılı', tests: [{ id: 't1' }], educatorName: 'Eğitmen B' }],
    });
    renderGrid('mine');
    expect(await screen.findByText('Tarih Yazılı')).toBeTruthy();
    expect(candidateWritten.myPackages).toHaveBeenCalled();
  });

  it('boş durumda mesaj gösterir', async () => {
    candidateWritten.listPackages.mockResolvedValue({ items: [] });
    const { container } = renderGrid('discover');
    await waitFor(() => expect(container.querySelector('p')).toBeTruthy());
  });
});
