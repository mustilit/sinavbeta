import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentSolve from '../StudentSolve';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', username: 'ALEF-S-1', school: { schoolRole: 'STUDENT' } } },
  api: { get: vi.fn(), start: vi.fn(), saveAnswer: vi.fn(), submit: vi.fn(), uploadImage: vi.fn() },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ studentAssignments: h.api, studentPractice: h.api, schoolTunnel: { start: vi.fn(), answer: vi.fn() } }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p)}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/test/QuestionCanvas', () => ({ default: () => <div data-testid="canvas" /> }));
vi.mock('@/components/test/TestWatermark', () => ({ TestWatermark: () => <div data-testid="watermark" /> }));
vi.mock('@/components/school/SchoolTunnelSolver', () => ({ SchoolTunnelSolver: () => <div data-testid="tunnel-solver" /> }));
vi.mock('@/components/notes/NoteWidget', () => ({ NoteWidget: () => null }));

const WRITTEN = {
  examType: 'WRITTEN', title: 'Matematik Yazılı', open: true, submitted: false, durationMinutes: 40,
  questions: [
    { id: 'q1', content: '6 × 3 işlemini açıklayınız', points: 1, mediaUrl: null, selectedOptionId: null, textAnswer: '', imageUrls: [] },
    { id: 'q2', content: '10 × 6 işlemini açıklayınız', points: 1, mediaUrl: null, selectedOptionId: null, textAnswer: '', imageUrls: [] },
  ],
};
const TEST = {
  examType: 'TEST', title: 'Fen Testi', open: true, submitted: false, durationMinutes: 20,
  questions: [{ id: 'q1', content: 'Soru 1', points: 2, mediaUrl: null, selectedOptionId: null, options: [{ id: 'o1', content: 'A' }, { id: 'o2', content: 'B' }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', username: 'ALEF-S-1', school: { schoolRole: 'STUDENT' } } };
  h.api.start.mockResolvedValue({ submissionId: 's1' });
  h.api.saveAnswer.mockResolvedValue({ ok: true });
  h.api.submit.mockResolvedValue({ status: 'SUBMITTED' });
});
const render = () => renderWithProviders(<StudentSolve />, { route: '/StudentSolve?id=a1' });

describe('StudentSolve — market parite + veri girişi', () => {
  it('ödev yok → bulunamadı', async () => {
    h.api.get.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText('Ödev bulunamadı')).toBeInTheDocument();
  });

  it('kapalı ödev → çözüme kapalı', async () => {
    h.api.get.mockResolvedValue({ ...WRITTEN, open: false });
    render();
    expect(await screen.findByText('Ödev çözüme kapalı')).toBeInTheDocument();
  });

  it('YAZILI: filigran + süre + kalem + textarea VERİ GİRİŞİ çalışır (regresyon)', async () => {
    h.api.get.mockResolvedValue(WRITTEN);
    render();
    const ta = await screen.findByPlaceholderText(/Cevabınız/);
    expect(screen.getByTestId('watermark')).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getAllByText(/cevaplandı/).length).toBeGreaterThan(0);
    // Kritik: çok karakterli giriş kabul edilmeli (eski hata: her tuşta remount → tek karakter)
    fireEvent.change(ta, { target: { value: 'altı çarpı üç on sekiz eder' } });
    expect(ta).toHaveValue('altı çarpı üç on sekiz eder');
    await waitFor(() => expect(h.api.saveAnswer).toHaveBeenCalledWith('a1', expect.objectContaining({ questionId: 'q1', textAnswer: 'altı çarpı üç on sekiz eder' })));
  });

  it('YAZILI: soru-soru gezinme (numaralı ızgara)', async () => {
    h.api.get.mockResolvedValue(WRITTEN);
    render();
    await screen.findByText(/6 × 3/);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByText(/10 × 6/)).toBeInTheDocument();
  });

  it('TEST: şık seçimi saveAnswer çağırır', async () => {
    h.api.get.mockResolvedValue(TEST);
    render();
    await screen.findByText('Soru 1');
    fireEvent.click(screen.getByRole('button', { name: /A/ }));
    await waitFor(() => expect(h.api.saveAnswer).toHaveBeenCalledWith('a1', expect.objectContaining({ questionId: 'q1', selectedOptionId: 'o1' })));
  });

  it('teslim onayı → submit', async () => {
    h.api.get.mockResolvedValue(TEST);
    render();
    await screen.findByText('Soru 1');
    fireEvent.click(screen.getAllByRole('button', { name: /Teslim Et/ })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Teslim Et/ }));
    await waitFor(() => expect(h.api.submit).toHaveBeenCalled());
  });

  it('bej (sepia) modu body class ekler', async () => {
    h.api.get.mockResolvedValue(TEST);
    render();
    await screen.findByText('Soru 1');
    fireEvent.click(screen.getByRole('button', { name: 'Bej okuma modu' }));
    expect(document.body.classList.contains('exam-sepia')).toBe(true);
  });

  it('TUNNEL → adaptif çözücü (SchoolTunnelSolver)', async () => {
    h.api.get.mockResolvedValue({ examType: 'TUNNEL', examId: 'tx1', open: true, submitted: false, title: 'Tünel', questions: [] });
    render();
    expect(await screen.findByTestId('tunnel-solver')).toBeInTheDocument();
  });

  it('TUNNEL: "Kaydet ve Çık" → listeye döner (ilerleme sunucuda kayıtlı)', async () => {
    h.api.get.mockResolvedValue({ examType: 'TUNNEL', examId: 'tx1', open: true, submitted: false, title: 'Tünel', questions: [] });
    render();
    await screen.findByTestId('tunnel-solver');
    fireEvent.click(screen.getByRole('button', { name: /Kaydet ve Çık/ }));
    await waitFor(() => expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('StudentAssignments')));
    expect(h.api.submit).not.toHaveBeenCalled();
  });

  it('YAZILI: fotoğraf yükleme YOK (yalnız metin + kalem)', async () => {
    h.api.get.mockResolvedValue(WRITTEN);
    render();
    await screen.findByText(/6 × 3/);
    // Cevap fotoğrafı yükleme kaldırıldı — dosya girişi/"Fotoğraf" butonu olmamalı
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('Fotoğraf')).toBeNull();
    expect(screen.getByPlaceholderText(/Cevabınız/)).toBeInTheDocument();
  });

  it('Kaydet ve Çık → autosave flush + listeye döner (teslim etmez)', async () => {
    h.api.get.mockResolvedValue(TEST);
    render();
    await screen.findByText('Soru 1');
    fireEvent.click(screen.getByRole('button', { name: /Kaydet ve Çık/ }));
    await waitFor(() => expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('StudentAssignments')));
    expect(h.api.submit).not.toHaveBeenCalled();
  });
});
