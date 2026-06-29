import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentExplore from '../StudentExplore';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: { listExams: vi.fn() },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ studentPractice: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p)}` }));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.listExams.mockResolvedValue({
    gradeLevel: 5,
    items: [
      { id: 't1', title: 'Test A', examType: 'TEST', subject: 'Mat', questionCount: 10, durationMinutes: 20, status: 'IN_PROGRESS', score: null, maxScore: null },
      { id: 't2', title: 'Test D', examType: 'TEST', subject: 'Mat', questionCount: 8, status: 'GRADED', score: 6, maxScore: 8 },
      { id: 'w1', title: 'Yazılı B', examType: 'WRITTEN', subject: 'Türkçe', questionCount: 4, status: 'SUBMITTED' },
      { id: 'u1x', title: 'Tünel C', examType: 'TUNNEL', subject: 'Fen', questionCount: 30, status: 'COMPLETED' },
    ],
  });
});

describe('StudentExplore — serbest alıştırma kataloğu', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentExplore />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('seviyedeki sınavlar + seviye başlığı', async () => {
    renderWithProviders(<StudentExplore />);
    expect(await screen.findByText('Test A')).toBeInTheDocument();
    expect(screen.getByText(/5\. sınıf seviyendeki tüm sınavlar/)).toBeInTheDocument();
  });

  it('devam eden TEST → Devam Et, çözülmüş TEST → Sonuç + Tekrar + skor', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    expect(screen.getByRole('button', { name: /Devam Et/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sonuç/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tekrar/ })).toBeInTheDocument();
    expect(screen.getByText('6/8')).toBeInTheDocument();
  });

  it('Başla → StudentSolve?practice=examId', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('StudentSolve?practice=t1'));
  });

  it('Yazılı sekmesi → öz-değerlendirme sınavı (Sonuç var, skor yok)', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    fireEvent.click(screen.getByRole('button', { name: /Yazılı/ }));
    expect(await screen.findByText('Yazılı B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sonuç/ })).toBeInTheDocument();
  });

  it('Tünel sekmesi: tamamlandı rozeti + Tekrar (Sonuç yok)', async () => {
    renderWithProviders(<StudentExplore />);
    await screen.findByText('Test A');
    fireEvent.click(screen.getByRole('button', { name: /Tünel/ }));
    expect(await screen.findByText('Tünel C')).toBeInTheDocument();
    expect(screen.getByText('Tamamlandı')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sonuç/ })).toBeNull();
  });

  it('boş tür → "Bu türde sınav yok"', async () => {
    h.api.listExams.mockResolvedValue({ gradeLevel: 5, items: [] });
    renderWithProviders(<StudentExplore />);
    expect(await screen.findByText('Bu türde sınav yok.')).toBeInTheDocument();
  });
});
