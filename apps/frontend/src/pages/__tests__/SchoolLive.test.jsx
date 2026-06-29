import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolLive from '../SchoolLive';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } },
  api: { live: { list: vi.fn(), create: vi.fn() } },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/live/LiveQuestionsEditor', () => ({
  LiveQuestionsEditor: () => <div data-testid="live-editor" />,
  emptyQuestion: () => ({ content: 'S', mediaUrl: '', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }] }),
}));
vi.mock('@/components/school/PeriodSelect', () => ({
  PeriodSelect: ({ value, onChange }) => <button type="button" onClick={() => onChange('p1')}>dönem:{value || 'yok'}</button>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
  h.api.live.list.mockResolvedValue([{ id: 'ls1', title: 'Canlı 1', status: 'ACTIVE', joinCode: 'AB12', questionCount: 3, participantCount: 5 }]);
  h.api.live.create.mockResolvedValue({ id: 'new-live' });
});
const render = () => renderWithProviders(<SchoolLive />, { route: '/SchoolLive' });

describe('SchoolLive', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    render();
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('dönem seçince liste yüklenir', async () => {
    render();
    fireEvent.click(screen.getByText(/dönem:/));
    expect(await screen.findByText('Canlı 1')).toBeInTheDocument();
    expect(screen.getByText('AB12')).toBeInTheDocument();
  });

  it('boş liste mesajı', async () => {
    h.api.live.list.mockResolvedValue([]);
    render();
    fireEvent.click(screen.getByText(/dönem:/));
    expect(await screen.findByText(/Henüz canlı oturum yok/)).toBeInTheDocument();
  });

  it('Yeni Oturum → oluşturma ekranı + başlık + Oluştur → live.create', async () => {
    render();
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByText('Canlı 1');
    fireEvent.click(screen.getByRole('button', { name: /Yeni Oturum/ }));
    expect(await screen.findByTestId('live-editor')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Başlık'), { target: { value: 'Matematik Canlı' } });
    fireEvent.click(screen.getByRole('button', { name: /^Oluştur$/ }));
    await waitFor(() => expect(h.api.live.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Matematik Canlı' })));
    await waitFor(() => expect(h.nav).toHaveBeenCalled());
  });

  it('oturumu yönet → SchoolLiveHost', async () => {
    render();
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByText('Canlı 1');
    fireEvent.click(screen.getByRole('button', { name: /Yönet/ }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('SchoolLiveHost'));
  });
});
