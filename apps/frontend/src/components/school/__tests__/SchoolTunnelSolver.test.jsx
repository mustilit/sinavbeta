import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import { SchoolTunnelSolver } from '../SchoolTunnelSolver';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', username: 'ANK-S-1', email: 'a@b.com' } },
  api: { start: vi.fn(), answer: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ schoolTunnel: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/test/QuestionCanvas', () => ({ default: () => <div data-testid="canvas" /> }));
vi.mock('@/components/test/TestWatermark', () => ({ TestWatermark: () => <div data-testid="watermark" /> }));
vi.mock('@/components/notes/NoteWidget', () => ({ NoteWidget: () => null }));

const inProgress = {
  status: 'IN_PROGRESS', title: 'Çarpım Tüneli', progressPercent: 20, masteredQuestions: 1, totalQuestions: 5,
  currentQuestion: { id: 'q1', content: '6 × 3 = ?', mediaUrl: null, options: [{ id: 'o1', content: '18' }, { id: 'o2', content: '21' }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', username: 'ANK-S-1', email: 'a@b.com' } };
  h.api.start.mockResolvedValue(inProgress);
  h.api.answer.mockResolvedValue({ correct: true, correctOptionId: 'o1', state: inProgress });
});
const render = () => renderWithProviders(<SchoolTunnelSolver examId="ex1" />);

describe('SchoolTunnelSolver', () => {
  it('soru + filigran + kalem + ilerleme', async () => {
    render();
    expect(await screen.findByText('6 × 3 = ?')).toBeInTheDocument();
    expect(screen.getByTestId('watermark')).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByText(/öğrenildi/)).toBeInTheDocument();
  });

  it('şık seçimi → answer çağrılır + geri bildirim', async () => {
    render();
    await screen.findByText('6 × 3 = ?');
    fireEvent.click(screen.getByRole('button', { name: /18/ }));
    await waitFor(() => expect(h.api.answer).toHaveBeenCalledWith('ex1', 'o1'));
    expect(await screen.findByText(/Doğru!/)).toBeInTheDocument();
  });

  it('bej (sepia) modu body class ekler', async () => {
    render();
    await screen.findByText('6 × 3 = ?');
    fireEvent.click(screen.getByRole('button', { name: 'Bej okuma modu' }));
    expect(document.body.classList.contains('exam-sepia')).toBe(true);
  });

  it('kalem aç/kapat', async () => {
    render();
    await screen.findByText('6 × 3 = ?');
    fireEvent.click(screen.getByRole('button', { name: 'Kalem' }));
    expect(screen.getByRole('button', { name: /Temizle/ })).toBeInTheDocument();
  });

  it('tamamlanınca kutlama', async () => {
    h.api.start.mockResolvedValue({ status: 'COMPLETED', totalQuestions: 5, currentQuestion: null });
    render();
    expect(await screen.findByText(/Tüneli tamamladın/)).toBeInTheDocument();
  });

  it('hata → "Tünel açılamadı"', async () => {
    h.api.start.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText('Tünel açılamadı')).toBeInTheDocument();
  });
});
