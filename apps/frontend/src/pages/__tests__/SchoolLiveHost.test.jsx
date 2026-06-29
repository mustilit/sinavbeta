import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolLiveHost from '../SchoolLiveHost';

const h = vi.hoisted(() => ({
  api: { live: { host: vi.fn(), start: vi.fn(), advance: vi.fn(), prev: vi.fn(), toggleStats: vi.fn(), end: vi.fn() } },
  nav: vi.fn(),
}));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-qr-code', () => ({ default: () => <div data-testid="qr" /> }));

const Q = { id: 'q1', content: 'Soru içeriği', mediaUrl: null, options: [{ id: 'o1', content: 'A', isCorrect: true }, { id: 'o2', content: 'B', isCorrect: false }] };
const baseActive = {
  status: 'ACTIVE', title: 'Canlı Oturum', joinCode: 'AB12', participantCount: 5, activeParticipantCount: 2,
  showStats: false, currentQuestionIdx: 0, totalQuestions: 2, currentQuestion: Q,
  stats: { q1: [{ optionId: 'o1', count: 3 }, { optionId: 'o2', count: 1 }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(h.api.live).forEach((fn) => fn.mockResolvedValue({ ok: true }));
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
});
const render = (route = '/SchoolLiveHost?id=ls1') => renderWithProviders(<SchoolLiveHost />, { route });

describe('SchoolLiveHost', () => {
  it('oturum yoksa → bulunamadı', async () => {
    h.api.live.host.mockResolvedValue(null);
    render();
    expect(await screen.findByText('Oturum bulunamadı.')).toBeInTheDocument();
  });

  it('DRAFT → Başlat → live.start', async () => {
    h.api.live.host.mockResolvedValue({ ...baseActive, status: 'DRAFT' });
    render();
    expect(await screen.findByText('Taslak')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Başlat/ }));
    await waitFor(() => expect(h.api.live.start).toHaveBeenCalledWith('ls1'));
  });

  it('ACTIVE → Sonraki/Sonuçları Göster çalışır', async () => {
    h.api.live.host.mockResolvedValue(baseActive);
    render();
    expect(await screen.findByText('Yayında')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    await waitFor(() => expect(h.api.live.advance).toHaveBeenCalledWith('ls1'));
    fireEvent.click(screen.getByRole('button', { name: /Sonuçları Göster/ }));
    await waitFor(() => expect(h.api.live.toggleStats).toHaveBeenCalledWith('ls1'));
  });

  it('ACTIVE → Bitir → onay → live.end', async () => {
    h.api.live.host.mockResolvedValue(baseActive);
    render();
    await screen.findByText('Yayında');
    fireEvent.click(screen.getByRole('button', { name: /Bitir/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Bitir$/ }));
    await waitFor(() => expect(h.api.live.end).toHaveBeenCalledWith('ls1'));
  });

  it('kodu kopyala → clipboard', async () => {
    h.api.live.host.mockResolvedValue(baseActive);
    render();
    await screen.findByText('Yayında');
    fireEvent.click(screen.getByRole('button', { name: /Kodu kopyala/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AB12');
  });

  it('ENDED → tamamlandı + dağılım gösterilir', async () => {
    h.api.live.host.mockResolvedValue({ ...baseActive, status: 'ENDED', showStats: false });
    render();
    expect(await screen.findByText('Oturum tamamlandı')).toBeInTheDocument();
    // ENDED'de dağılım otomatik → yüzde görünür
    expect(screen.getByText(/%75/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Canlı Sınavlara Dön/ }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('SchoolLive'));
  });
});
