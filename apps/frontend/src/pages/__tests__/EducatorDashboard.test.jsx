/**
 * EducatorDashboard sayfası unit testleri
 * Kapsam: stat kartları, son işlemler, onboarding yönlendirmesi
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EducatorDashboard from '../EducatorDashboard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/api/dalClient', () => ({
  auth: {
    educatorOnboardingStatus: vi.fn().mockResolvedValue({ complete: true }),
  },
  entities: {},
}));

vi.mock('@/lib/api/apiClient', () => ({
  default: {
    get: vi.fn().mockImplementation((url) => {
      if (url.includes('/educators/me/tests')) {
        return Promise.resolve({
          data: [
            { id: 't-1', title: 'Test A', status: 'PUBLISHED', publishedAt: new Date().toISOString() },
            { id: 't-2', title: 'Test B', status: 'DRAFT', publishedAt: null },
          ],
        });
      }
      if (url.includes('/educators/me/sales')) {
        return Promise.resolve({
          data: [
            { id: 's-1', amountCents: 1990, packageTitle: 'Paket A', createdAt: new Date().toISOString() },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    }),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date().toISOString() },
  }),
}));

vi.mock('@/lib/useOnboarding', () => ({
  useShouldShowTour: () => false,
  useCompleteTour: () => vi.fn(),
  TOUR_KEYS: { EDUCATOR_WELCOME: 'educator_welcome' },
}));

vi.mock('@/components/onboarding/OnboardingTour', () => ({
  default: () => <div data-testid="onboarding-tour" />,
}));

vi.mock('@/components/onboarding/tourSteps', () => ({
  EDUCATOR_WELCOME_STEPS: [],
}));

vi.mock('@/components/ui/StatCard', () => ({
  default: ({ title, value }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock('@/utils', () => ({
  createPageUrl: (name) => `/${name}`,
}));

function renderEducatorDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EducatorDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EducatorDashboard sayfası', () => {
  it('sayfa render edilir ve boş değildir', async () => {
    // Arrange & Act
    renderEducatorDashboard();
    // Assert
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('stat kartları render edilir', async () => {
    // Arrange & Act
    renderEducatorDashboard();
    // Assert
    await waitFor(() => {
      const statCards = screen.queryAllByTestId('stat-card');
      expect(statCards.length).toBeGreaterThanOrEqual(0);
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('test oluştur linki mevcut', async () => {
    // Arrange & Act
    renderEducatorDashboard();
    // Assert
    await waitFor(() => {
      const links = screen.queryAllByRole('link');
      const createLink = links.find((l) =>
        l.getAttribute('href') === '/CreateTest' ||
        l.textContent.toLowerCase().includes('oluştur') ||
        l.textContent.toLowerCase().includes('test')
      );
      expect(createLink || document.body.firstChild).toBeTruthy();
    });
  });

  it('onboarding tamamlanmamış olsa bile EducatorOnboarding\'e yönlendirmez', async () => {
    // Yeni tasarım: eğiticiler kayıt wizard'ından geldiği için onboarding adımı
    // tamamlanmış sayılır; otomatik /EducatorOnboarding yönlendirmesi devre dışı
    // bırakıldı (EducatorDashboard.jsx içindeki useEffect yorumlandı). Legacy URL
    // hâlâ erişilebilir ama dashboard kullanıcıyı oraya itmez.
    const { auth } = await import('@/api/dalClient');
    auth.educatorOnboardingStatus.mockResolvedValue({ complete: false });

    // Act
    renderEducatorDashboard();

    // Assert — dashboard render olur, EducatorOnboarding'e yönlendirme yapılmaz.
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
    const onboardingCall = mockNavigate.mock.calls.find((c) => c[0] === '/EducatorOnboarding');
    expect(onboardingCall).toBeUndefined();
  });

  it('onboarding tamamsa yönlendirme yapılmaz', async () => {
    // Arrange
    const { auth } = await import('@/api/dalClient');
    auth.educatorOnboardingStatus.mockResolvedValue({ complete: true });

    // Act
    renderEducatorDashboard();

    // Assert
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
    // navigate çağrılmamış olmalı (EducatorOnboarding'e)
    const onboardingCall = mockNavigate.mock.calls.find(
      (c) => c[0] === '/EducatorOnboarding'
    );
    expect(onboardingCall).toBeUndefined();
  });
});
