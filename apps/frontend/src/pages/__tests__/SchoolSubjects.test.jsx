import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolSubjects from '../SchoolSubjects';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } },
  api: { listSubjects: vi.fn(), createSubject: vi.fn(), deleteSubject: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } };
  h.api.listSubjects.mockResolvedValue([{ id: 's1', name: 'Matematik' }, { id: 's2', name: 'Fen' }]);
  h.api.createSubject.mockResolvedValue({ id: 's3', name: 'Tarih' });
  h.api.deleteSubject.mockResolvedValue({ ok: true });
});

describe('SchoolSubjects', () => {
  it('yönetici değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<SchoolSubjects />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('boş liste → "Henüz ders yok"', async () => {
    h.api.listSubjects.mockResolvedValue([]);
    renderWithProviders(<SchoolSubjects />);
    expect(await screen.findByText(/Henüz ders yok/)).toBeInTheDocument();
  });

  it('dersleri listeler + yeni ders ekler', async () => {
    renderWithProviders(<SchoolSubjects />);
    expect(await screen.findByText('Matematik')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/Ders adı/);
    fireEvent.change(input, { target: { value: 'Tarih' } });
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(h.api.createSubject).toHaveBeenCalledWith({ name: 'Tarih' }));
  });

  it('ders siler (dialog onayı)', async () => {
    renderWithProviders(<SchoolSubjects />);
    const row = (await screen.findByText('Matematik')).closest('div.group');
    fireEvent.click(within(row).getByTitle('Sil'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(h.api.deleteSubject).toHaveBeenCalledWith('s1'));
  });

  it('boş isimle submit → createSubject çağrılmaz', async () => {
    renderWithProviders(<SchoolSubjects />);
    await screen.findByText('Matematik');
    fireEvent.click(screen.getByRole('button', { name: /Ekle/ }));
    expect(h.api.createSubject).not.toHaveBeenCalled();
  });
});
