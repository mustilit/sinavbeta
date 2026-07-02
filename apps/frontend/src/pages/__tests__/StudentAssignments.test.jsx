import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import i18n from '@/lib/i18n';
import StudentAssignments from '../StudentAssignments';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT', schoolName: 'Okul' } } },
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
  i18n.changeLanguage('tr'); // i18n metinleri Türkçe doğrula
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT', schoolName: 'Okul' } } };
  h.api.list.mockResolvedValue({ items: [
    { id: 'a1', title: 'Açık Test', examType: 'TEST', dueDate: future, durationMinutes: 30, submitted: false, open: true, submissionStatus: null, score: null, maxScore: null },
    { id: 'a2', title: 'Teslim Yazılı', examType: 'WRITTEN', dueDate: past, submitted: true, open: false, score: 8, maxScore: 10 },
    { id: 'a3', title: 'Süresi Geçen', examType: 'TUNNEL', dueDate: past, submitted: false, open: false, score: null },
  ] });
});

describe('StudentAssignments', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentAssignments />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });
  it('ödevleri listeler (açık/teslim/süresi geçen)', async () => {
    renderWithProviders(<StudentAssignments />);
    expect(await screen.findByText('Açık Test')).toBeInTheDocument();
    expect(screen.getByText('Teslim Yazılı')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText(/süresi geçti/)).toBeInTheDocument();
  });
  it('boş sekme → mesaj', async () => {
    h.api.list.mockResolvedValue({ items: [] });
    renderWithProviders(<StudentAssignments />);
    expect(await screen.findByText('Bu sekmede ödev yok.')).toBeInTheDocument();
  });
  it('sekme değişimi list filtresini değiştirir', async () => {
    renderWithProviders(<StudentAssignments />);
    await screen.findByText('Açık Test');
    fireEvent.click(screen.getByRole('button', { name: 'Teslim Edilen' }));
    expect(h.api.list).toHaveBeenCalledWith({ filter: 'submitted' });
  });
  it('Başla / Sonuç butonları navigasyon yapar', async () => {
    renderWithProviders(<StudentAssignments />);
    await screen.findByText('Açık Test');
    fireEvent.click(screen.getByRole('button', { name: /Başla/ }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('StudentSolve'));
    fireEvent.click(screen.getByRole('button', { name: /Sonuç/ }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('StudentResult'));
  });

  it('sistem dışı ödev: rozet + açıklama görünür, Başla/Sonuç butonu YOK', async () => {
    h.api.list.mockResolvedValue({ items: [
      { id: 'off1', title: 'Kitap özeti', isOffline: true, offlineDescription: '3. bölümü oku', offlineDone: false, examType: null, subject: 'Matematik', dueDate: future, submitted: false, open: false, score: null },
    ] });
    renderWithProviders(<StudentAssignments />);
    expect(await screen.findByText('Kitap özeti')).toBeInTheDocument();
    expect(screen.getByText('3. bölümü oku')).toBeInTheDocument();
    // Sistem dışı ödev uygulama içinde çözülmez → Başla butonu olmamalı
    expect(screen.queryByRole('button', { name: /Başla/ })).toBeNull();
  });

  it('sistem dışı ödev yapıldı → "Yapıldı" durum rozeti', async () => {
    h.api.list.mockResolvedValue({ items: [
      { id: 'off1', title: 'Kitap özeti', isOffline: true, offlineDescription: 'oku', offlineDone: true, examType: null, subject: 'Matematik', dueDate: future, submitted: true, open: false, score: null },
    ] });
    renderWithProviders(<StudentAssignments />);
    await screen.findByText('Kitap özeti');
    expect(screen.getByText(i18n.t('school:assignments.offlineDone'))).toBeInTheDocument();
  });
});
