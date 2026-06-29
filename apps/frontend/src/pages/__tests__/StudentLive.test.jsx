import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentLive from '../StudentLive';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: { state: vi.fn(), ping: vi.fn(), join: vi.fn(), answer: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ studentLive: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/live/LiveSessionInfoModal', () => ({ LiveSessionInfoModal: () => null, useLiveSessionIntro: () => ({ open: false, setOpen: vi.fn() }) }));

const Q = { id: 'q1', content: 'Soru?', mediaUrl: null, options: [{ id: 'o1', content: 'A' }, { id: 'o2', content: 'B' }] };
const active = {
  status: 'ACTIVE', title: 'Canlı', participantCount: 4, currentQuestionIdx: 0, totalQuestions: 2,
  currentQuestion: Q, myAnswer: null, showStats: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.ping.mockResolvedValue({});
  h.api.join.mockResolvedValue({ sessionId: 's1' });
  h.api.answer.mockResolvedValue({ ok: true });
  h.api.state.mockResolvedValue(active);
});
const render = (code = '123456') => renderWithProviders(<StudentLive />, { route: `/StudentLive?code=${code}` });

describe('StudentLive', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    render();
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('kod giriş ekranı → Katıl → join', async () => {
    render();
    expect(screen.getByText('Canlı Sınava Katıl')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Katıl/ }));
    await waitFor(() => expect(h.api.join).toHaveBeenCalledWith('123456'));
  });

  it('katılınca DRAFT → bekleme odası', async () => {
    h.api.state.mockResolvedValue({ status: 'DRAFT', title: 'Bekle', participantCount: 2 });
    render();
    fireEvent.click(screen.getByRole('button', { name: /Katıl/ }));
    expect(await screen.findByText(/Sınav henüz başlatılmadı/)).toBeInTheDocument();
  });

  it('ACTIVE → şık seç → answer gönderilir', async () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: /Katıl/ }));
    expect(await screen.findByText('Soru?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^A/ }));
    await waitFor(() => expect(h.api.answer).toHaveBeenCalledWith('s1', { questionId: 'q1', optionId: 'o1' }));
    expect(await screen.findByText(/Cevabınız kaydedildi/)).toBeInTheDocument();
  });

  it('ACTIVE showStats → sınıf sonuçları + görsel büyüteç', async () => {
    h.api.state.mockResolvedValue({
      ...active, showStats: true, myAnswer: 'o1',
      currentQuestion: { id: 'q1', content: 'Soru?', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: 'http://i/a.png' }, { id: 'o2', content: 'B' }] },
      stats: { q1: [{ optionId: 'o1', count: 3, isCorrect: true }, { optionId: 'o2', count: 1, isCorrect: false }] },
    });
    render();
    fireEvent.click(screen.getByRole('button', { name: /Katıl/ }));
    expect(await screen.findByText('Sınıf Sonuçları')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Görseli büyüt' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ENDED → sonuç ekranı (skor + soru detayları)', async () => {
    h.api.state.mockResolvedValue({
      status: 'ENDED', title: 'Bitti', participantCount: 4, totalQuestions: 2,
      myResults: { correct: 1, total: 2, answers: [
        { questionId: 'q1', questionContent: 'S1', chosenOptionId: 'o1', chosenOptionContent: 'A', isCorrect: true, correctOptionContent: 'A' },
        { questionId: 'q2', questionContent: 'S2', chosenOptionId: null, isCorrect: false, correctOptionContent: 'B' },
      ] },
    });
    render();
    fireEvent.click(screen.getByRole('button', { name: /Katıl/ }));
    expect(await screen.findByText('Sınav Tamamlandı!')).toBeInTheDocument();
    expect(screen.getByText('%50 başarı')).toBeInTheDocument();
    expect(screen.getByText(/Cevaplanmadı/)).toBeInTheDocument();
    // Kapat → kod giriş ekranına döner
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(await screen.findByText('Canlı Sınava Katıl')).toBeInTheDocument();
  });
});
