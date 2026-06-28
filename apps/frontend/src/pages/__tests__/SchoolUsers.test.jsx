import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolUsers from '../SchoolUsers';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } },
  api: {
    periods: vi.fn(), listBranches: vi.fn(), listDepartments: vi.fn(), listUsers: vi.fn(),
    createUser: vi.fn(), setUserActive: vi.fn(), resetPassword: vi.fn(), bulkCreateStudents: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USERS = [
  { id: 'su1', username: 'ANK-T-0001', fullName: 'Ali Veli', schoolRole: 'TEACHER', classroomName: null, departmentName: 'Mat', branchName: null, isActive: true },
  { id: 'su2', username: 'ANK-B-0001', fullName: null, schoolRole: 'BRANCH_ADMIN', branchName: 'Merkez', isActive: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } };
  h.api.periods.mockResolvedValue({ currentPeriodId: null, periods: [] });
  h.api.listBranches.mockResolvedValue([{ id: 'b1', name: 'Merkez' }]);
  h.api.listDepartments.mockResolvedValue([{ id: 'd1', name: 'Mat' }]);
  h.api.listUsers.mockResolvedValue({ items: USERS, nextCursor: null });
  h.api.createUser.mockResolvedValue({ username: 'ANK-T-0002', tempPassword: 'abc12345' });
  h.api.setUserActive.mockResolvedValue({ id: 'su1', isActive: false });
  h.api.resetPassword.mockResolvedValue({ username: 'ANK-T-0001', tempPassword: 'xyz98765' });
});

describe('SchoolUsers', () => {
  it('okul rolü yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    renderWithProviders(<SchoolUsers />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('admin: kullanıcı tablosu + rol/durum rozetleri', async () => {
    renderWithProviders(<SchoolUsers />);
    expect(await screen.findByText('ANK-T-0001')).toBeInTheDocument();
    expect(screen.getByText('Ali Veli')).toBeInTheDocument();
    expect(screen.getAllByText('Aktif').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pasif').length).toBeGreaterThan(0);
  });

  it('boş liste → "Kullanıcı bulunamadı"', async () => {
    h.api.listUsers.mockResolvedValue({ items: [], nextCursor: null });
    renderWithProviders(<SchoolUsers />);
    expect(await screen.findByText('Kullanıcı bulunamadı.')).toBeInTheDocument();
  });

  it('kullanıcı ekle dialog → createUser çağrılır', async () => {
    renderWithProviders(<SchoolUsers />);
    await screen.findByText('ANK-T-0001');
    fireEvent.click(screen.getByRole('button', { name: /Kullanıcı Ekle/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ad'), { target: { value: 'Yeni' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(h.api.createUser).toHaveBeenCalled());
  });

  it('satır: şifre sıfırla', async () => {
    renderWithProviders(<SchoolUsers />);
    const row = (await screen.findByText('ANK-T-0001')).closest('tr');
    fireEvent.click(within(row).getByText('Şifre').closest('button'));
    await waitFor(() => expect(h.api.resetPassword).toHaveBeenCalledWith('su1'));
  });

  it('satır: aktif/pasif toggle (pasif kullanıcıyı aktive eder)', async () => {
    renderWithProviders(<SchoolUsers />);
    const row = (await screen.findByText('ANK-B-0001')).closest('tr'); // su2 pasif → "Aktif" butonu
    fireEvent.click(within(row).getByText('Aktif').closest('button'));
    await waitFor(() => expect(h.api.setUserActive).toHaveBeenCalledWith('su2', true));
  });

  it('Öğrenciler sekmesi → Öğrenci Ekle butonu', async () => {
    renderWithProviders(<SchoolUsers />);
    await screen.findByText('ANK-T-0001');
    fireEvent.click(screen.getByRole('button', { name: /Öğrenciler/ }));
    expect(screen.getByRole('button', { name: /Öğrenci Ekle/ })).toBeInTheDocument();
  });

  it('öğretmen (admin değil): İşlem sütunu + ekle butonu yok', async () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<SchoolUsers />);
    await screen.findByText('ANK-T-0001');
    expect(screen.queryByRole('button', { name: /Kullanıcı Ekle/ })).toBeNull();
  });
});
