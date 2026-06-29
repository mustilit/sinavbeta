import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolExamEdit from '../SchoolExamEdit';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } },
  api: {
    exams: { get: vi.fn(), create: vi.fn(), update: vi.fn(), saveQuestions: vi.fn() },
    listSubjects: vi.fn(), listLevels: vi.fn(), listTopics: vi.fn(),
  },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/school/SchoolExamQuestionsEditor', () => ({
  SchoolExamQuestionsEditor: () => <div data-testid="q-editor" />,
  toLocalQuestions: vi.fn(() => [{ _k: '1', content: 'S' }]),
}));
vi.mock('@/components/school/SchoolTunnelEditor', () => ({
  SchoolTunnelEditor: () => <div data-testid="tunnel-editor" />,
  toLocalTunnelQuestions: vi.fn(() => [{ _k: 't1' }]),
  uploadPendingTunnelImages: vi.fn(async (q) => q),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
  h.api.listSubjects.mockResolvedValue([{ id: 's1', name: 'Mat' }]);
  h.api.listLevels.mockResolvedValue([{ gradeLevel: 5 }]);
  h.api.listTopics.mockResolvedValue([{ id: 't1', name: 'Cebir' }]);
  h.api.exams.create.mockResolvedValue({ id: 'new1' });
  h.api.exams.update.mockResolvedValue({ ok: true });
  h.api.exams.saveQuestions.mockResolvedValue({ saved: 1, totalPoints: 5 });
});
const render = (route = '/SchoolExamEdit?type=TEST') => renderWithProviders(<SchoolExamEdit />, { route });

describe('SchoolExamEdit', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    render();
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('yeni sınav: başlık + Oluştur → exams.create', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Başlık'), { target: { value: 'Ünite 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Oluştur ve Soru Ekle/ }));
    await waitFor(() => expect(h.api.exams.create).toHaveBeenCalledWith(expect.objectContaining({ examType: 'TEST', title: 'Ünite 1' })));
  });

  it('düzenleme: var olan sınav yüklenir → soru editörü + Soruları Kaydet', async () => {
    h.api.exams.get.mockResolvedValue({ id: 'ex1', examType: 'TEST', editable: true, title: 'Mevcut', questions: [{ content: 'q' }] });
    render('/SchoolExamEdit?id=ex1&type=TEST');
    expect(await screen.findByTestId('q-editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Soruları Kaydet/ }));
    await waitFor(() => expect(h.api.exams.saveQuestions).toHaveBeenCalledWith('ex1', expect.any(Array)));
  });

  it('düzenleme: Bilgileri Kaydet → exams.update', async () => {
    h.api.exams.get.mockResolvedValue({ id: 'ex1', examType: 'TEST', editable: true, title: 'Mevcut', questions: [] });
    render('/SchoolExamEdit?id=ex1&type=TEST');
    await screen.findByTestId('q-editor');
    fireEvent.click(screen.getByRole('button', { name: /Bilgileri Kaydet/ }));
    await waitFor(() => expect(h.api.exams.update).toHaveBeenCalledWith('ex1', expect.objectContaining({ title: 'Mevcut' })));
  });

  it('salt görüntüleme: editable=false', async () => {
    h.api.exams.get.mockResolvedValue({ id: 'ex1', examType: 'TEST', editable: false, title: 'X', questions: [] });
    render('/SchoolExamEdit?id=ex1&type=TEST');
    expect(await screen.findByText('Salt görüntüleme')).toBeInTheDocument();
  });

  it('TUNNEL düzenleme: tünel editörü', async () => {
    h.api.exams.get.mockResolvedValue({ id: 'tx1', examType: 'TUNNEL', editable: true, title: 'Tünel', questions: [], optionsPerQuestion: 10, layerCount: 7 });
    render('/SchoolExamEdit?id=tx1&type=TUNNEL');
    expect(await screen.findByTestId('tunnel-editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Soruları Kaydet/ }));
    await waitFor(() => expect(h.api.exams.saveQuestions).toHaveBeenCalled());
  });
});
