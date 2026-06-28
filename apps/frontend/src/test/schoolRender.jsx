/**
 * E-Sınıf UI testleri için ortak render yardımcısı.
 * QueryClient (retry kapalı) + MemoryRouter sarmalar.
 * dalClient / AuthContext / navigation / sonner mock'ları HER test dosyasında
 * ayrıca vi.mock ile tanımlanır (hoisting gereği paylaşılamaz).
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderWithProviders(ui, { route = '/' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
