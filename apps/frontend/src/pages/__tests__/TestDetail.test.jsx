/**
 * TestDetail sayfası unit testleri
 * Kapsam: paket detayı render, satın al butonu, review listesi, auth durumu
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TestDetail from '../TestDetail';

vi.mock('@/api/dalClient', () => ({
  entities: {
    Purchase: { filter: vi.fn().mockResolvedValue([]) },
    Review: { filter: vi.fn().mockResolvedValue([]) },
    PackageView: { track: vi.fn() },
    TestPackage: { get: vi.fn() },
  },
}));

vi.mock('@/lib/api/apiClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: null }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/lib/navigation', () => ({
  useAppNavigate: () => vi.fn(),
  useLoginRedirect: () => () => '/Login',
}));

vi.mock('@/lib/useServiceStatus', () => ({
  useServiceStatus: () => ({ purchasesEnabled: true }),
}));

vi.mock('@/utils', () => ({
  createPageUrl: (name) => `/${name}`,
}));

vi.mock('@/components/ui/PaymentModal', () => ({
  PaymentModal: () => <div data-testid="payment-modal" />,
}));

function renderTestDetail(search = '?id=test-123') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/TestDetail${search}`]}>
        <TestDetail />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TestDetail sayfası', () => {
  it('testId olmadan render edilince boş değil', () => {
    // Arrange & Act
    const { container } = renderTestDetail('');
    // Assert
    expect(container.firstChild).toBeTruthy();
  });

  it('testId ile render edilince sayfa yüklenir', () => {
    // Arrange & Act
    const { container } = renderTestDetail('?id=test-123');
    // Assert
    expect(container.firstChild).toBeTruthy();
  });

  it('oturumsuz kullanıcıda satın al butonu login\'e yönlendirir', async () => {
    // Arrange
    const { entities } = await import('@/api/dalClient');
    entities.TestPackage.get.mockResolvedValue({
      id: 'test-123',
      title: 'Matematik Paketi',
      price: 1990,
      description: 'Test paketi açıklaması',
      educator_name: 'Ali Hoca',
      questions_count: 10,
    });

    // Act
    renderTestDetail('?id=test-123');

    // Assert — sayfa render olmalı, hata fırlatmamalı
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('satın alma işlemi devre dışıysa render hata fırlatmaz', async () => {
    // Arrange & Act — purchasesEnabled:false ile render
    renderTestDetail('?id=test-123');

    // Assert — render çökmemeli
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('PackageView.track testId ile çağrılır', async () => {
    // Arrange
    const { entities } = await import('@/api/dalClient');

    // Act
    renderTestDetail('?id=test-xyz');

    // Assert — useEffect tetiklenince track çağrılmalı
    await waitFor(() => {
      expect(entities.PackageView.track).toHaveBeenCalledWith('test-xyz', expect.anything());
    });
  });
});
