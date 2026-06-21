/**
 * TunnelGrid — tunel kart izgarasi (discover/mine) testleri.
 *
 * Kapsam:
 *   1. Discover: yalniz satin alinMAMIS tunelleri gosterir (purchased=false)
 *   2. Mine: yalniz satin alinan tunelleri gosterir (purchased=true)
 *   3. Discover: satin alinan tunel listede gorunmez
 *   4. Mine: satin alinmamis tunel listede gorunmez
 *   5. Discover: "Incele & Satin Al" butonu gorunur
 *   6. Mine: "Basla/Devam Et/Tamamlandi" butonu gorunur
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/dalClient', () => ({
  candidateTunnels: {
    list: vi.fn(),
  },
}));

vi.mock('@/utils', () => ({
  createPageUrl: (name) => `/${name}`,
}));

import { candidateTunnels } from '@/api/dalClient';
import { TunnelGrid } from '@/components/tunnel/TunnelGrid';

function renderGrid(mode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TunnelGrid mode={mode} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const TUNNELS = [
  {
    id: 'tn-1', title: 'Matematik Tuneli', priceCents: 3000, layerCount: 3,
    questionCount: 15, examTypeName: 'TYT', educatorUsername: 'hoca1',
    purchased: false, attemptStatus: null,
  },
  {
    id: 'tn-2', title: 'Fizik Tuneli', priceCents: 5000, layerCount: 5,
    questionCount: 25, examTypeName: 'AYT', educatorUsername: 'hoca2',
    purchased: true, attemptStatus: null,
  },
  {
    id: 'tn-3', title: 'Kimya Tuneli', priceCents: 0, layerCount: 2,
    questionCount: 10, examTypeName: 'TYT', educatorUsername: 'hoca1',
    purchased: true, attemptStatus: 'COMPLETED',
  },
];

describe('TunnelGrid — discover modu', () => {
  beforeEach(() => {
    candidateTunnels.list.mockResolvedValue({ items: TUNNELS });
  });

  it('yalniz satin alinMAMIS tunelleri gosterir', async () => {
    // Act
    renderGrid('discover');

    // Assert — purchased=false olan tn-1 gorunur
    expect(await screen.findByText('Matematik Tuneli')).toBeInTheDocument();

    // purchased=true olan tn-2, tn-3 gorunMEZ
    expect(screen.queryByText('Fizik Tuneli')).not.toBeInTheDocument();
    expect(screen.queryByText('Kimya Tuneli')).not.toBeInTheDocument();
  });

  it('"Incele & Satin Al" butonu gorunur', async () => {
    // Act
    renderGrid('discover');

    // Assert
    await waitFor(() => expect(screen.getByText('Matematik Tuneli')).toBeInTheDocument());
    expect(screen.getByText(/Satın Al/i)).toBeInTheDocument();
  });

  it('satin alinan tunel kesfet listesinden filtrelenir', async () => {
    // Arrange — hepsi purchased
    candidateTunnels.list.mockResolvedValue({
      items: [
        { id: 'tn-x', title: 'Alinmis Tunel', priceCents: 1000, layerCount: 1, questionCount: 5, purchased: true },
      ],
    });

    // Act
    renderGrid('discover');

    // Assert — hicbir tunel gorunmez, bos durum
    await waitFor(() => {
      expect(screen.queryByText('Alinmis Tunel')).not.toBeInTheDocument();
    });
  });
});

describe('TunnelGrid — mine modu', () => {
  beforeEach(() => {
    candidateTunnels.list.mockResolvedValue({ items: TUNNELS });
  });

  it('yalniz satin alinan tunelleri gosterir', async () => {
    // Act
    renderGrid('mine');

    // Assert — purchased=true olanlar gorunur
    expect(await screen.findByText('Fizik Tuneli')).toBeInTheDocument();
    expect(screen.getByText('Kimya Tuneli')).toBeInTheDocument();

    // purchased=false olan gorunmez
    expect(screen.queryByText('Matematik Tuneli')).not.toBeInTheDocument();
  });

  it('satin alinan tunel icin "Basla" butonu gorunur (henuz cozulmemis)', async () => {
    // Act
    renderGrid('mine');

    // Assert — tn-2 (attemptStatus=null) icin "Basla"
    await waitFor(() => expect(screen.getByText('Fizik Tuneli')).toBeInTheDocument());
    expect(screen.getByText('Başla')).toBeInTheDocument();
  });

  it('tamamlanmis tunel icin "Tamamlandi" butonu gorunur', async () => {
    // Act
    renderGrid('mine');

    // Assert — tn-3 (attemptStatus=COMPLETED) icin "Tamamlandi"
    await waitFor(() => expect(screen.getByText('Kimya Tuneli')).toBeInTheDocument());
    expect(screen.getByText('Tamamlandı')).toBeInTheDocument();
  });

  it('satin alinmamis tunel mine listesinde gorunmez', async () => {
    // Arrange — hepsi purchased=false
    candidateTunnels.list.mockResolvedValue({
      items: [
        { id: 'tn-y', title: 'Alinmamis Tunel', priceCents: 2000, layerCount: 2, questionCount: 8, purchased: false },
      ],
    });

    // Act
    renderGrid('mine');

    // Assert
    await waitFor(() => {
      expect(screen.queryByText('Alinmamis Tunel')).not.toBeInTheDocument();
    });
  });
});
