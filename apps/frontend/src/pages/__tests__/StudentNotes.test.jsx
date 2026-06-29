import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentNotes from '../StudentNotes';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: { list: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ notes: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.list.mockResolvedValue({
    items: [
      { id: 'n1', body: 'Kesirlerde payda eşitle', testTitle: 'E-Sınıf: Matematik', questionOrder: 3, questionExcerpt: '2/3 + 1/4 = ?', createdAt: '2026-06-20T10:00:00Z' },
      { id: 'n2', body: 'Genel hatırlatma', testTitle: null, questionOrder: null, questionExcerpt: null, createdAt: '2026-06-21T09:00:00Z' },
    ],
    total: 2, page: 1, pageSize: 10,
  });
  h.api.update.mockResolvedValue({ ok: true });
  h.api.remove.mockResolvedValue({ ok: true });
});

describe('StudentNotes', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentNotes />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('notları listeler (soru + genel)', async () => {
    renderWithProviders(<StudentNotes />);
    expect(await screen.findByText('Kesirlerde payda eşitle')).toBeInTheDocument();
    expect(screen.getByText('Genel hatırlatma')).toBeInTheDocument();
    expect(screen.getByText('Soru 3')).toBeInTheDocument();
    expect(screen.getByText('E-Sınıf: Matematik')).toBeInTheDocument();
  });

  it('arama sorguyu q ile tetikler', async () => {
    renderWithProviders(<StudentNotes />);
    await screen.findByText('Kesirlerde payda eşitle');
    fireEvent.change(screen.getByPlaceholderText('Notlarda ara…'), { target: { value: 'kesir' } });
    await waitFor(() => expect(h.api.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'kesir', page: 1 })));
  });

  it('sadece genel filtresi scope=general gönderir', async () => {
    renderWithProviders(<StudentNotes />);
    await screen.findByText('Kesirlerde payda eşitle');
    fireEvent.click(screen.getByRole('button', { name: /Sadece genel notlar/ }));
    await waitFor(() => expect(h.api.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'general' })));
  });

  it('düzenle → update', async () => {
    renderWithProviders(<StudentNotes />);
    await screen.findByText('Genel hatırlatma');
    fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]);
    const ta = screen.getByDisplayValue('Genel hatırlatma');
    fireEvent.change(ta, { target: { value: 'Güncellendi' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(h.api.update).toHaveBeenCalledWith('n2', 'Güncellendi'));
  });

  it('sil → onay → remove', async () => {
    renderWithProviders(<StudentNotes />);
    await screen.findByText('Kesirlerde payda eşitle');
    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]);
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(h.api.remove).toHaveBeenCalledWith('n1'));
  });
});
