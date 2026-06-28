import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentExplore from '../StudentExplore';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: { list: vi.fn() },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ studentAssignments: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p)}` }));

const future = new Date(Date.now() + 1e7).toISOString();
const past = new Date(Date.now() - 1e7).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.list.mockResolvedValue({ items: [
    { id: 't1', title: 'Test A', examType: 'TEST', dueDate: future, durationMinutes: 20, submitted: false, open: true, submissionStatus: 'IN_PROGRESS', score: null },
    { id: 'w1', title: 'Yazılı B', examType: 'WRITTEN', dueDate: past, submitted: true, open: false, score: 7, maxScore: 10 },
    { id: 'u1x', title: 'Tünel C', examType: 'TUNNEL', dueDate: past, submitted: false, open: false },
  ] });
});

describe('StudentExplore', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentExplore />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });
  it('TEST sekmesi varsayılan + Devam Et butonu', async () => {
    renderWithProviders(<StudentExplore />);
    expect(await screen.findByText('Test A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Devam Et/ })).toBeInTheDocument();
  });
  it('Yazılı sekmesine geçince yazılı sınav görünür', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    fireEvent.click(screen.getByRole('button', { name: /Yazılı/ }));
    expect(await screen.findByText('Yazılı B')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
  });
  it('Tünel sekmesi: kapalı (süresi geçen) → Kapalı rozeti', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    fireEvent.click(screen.getByRole('button', { name: /Tünel/ }));
    expect(await screen.findByText('Kapalı')).toBeInTheDocument();
  });
  it('boş tür → "Bu türde sınav yok"', async () => {
    h.api.list.mockResolvedValue({ items: [] });
    renderWithProviders(<StudentExplore />);
    expect(await screen.findByText('Bu türde sınav yok.')).toBeInTheDocument();
  });
});
