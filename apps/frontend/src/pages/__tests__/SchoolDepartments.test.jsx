import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolDepartments from '../SchoolDepartments';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } },
  api: {
    departmentTree: vi.fn(), listSubjects: vi.fn(), createDepartment: vi.fn(),
    assignMembers: vi.fn(), deleteDepartment: vi.fn(), departmentMembers: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/SubjectCombobox', () => ({
  SubjectCombobox: ({ value, onChange }) => (
    <input aria-label="ders-sec" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const TREE = {
  schoolWide: [{ id: 'd1', name: 'Genel Zümre', subject: 'Matematik', memberCount: 2, headLabel: 'Başkan A', headUserId: 'x', members: ['Öğr1', 'Öğr2'] }],
  branches: [{
    id: 'b1', name: 'Merkez', departments: [{ id: 'd2', name: 'Şube Zümre', subject: 'Fen', memberCount: 0, headLabel: null, headUserId: null, members: [] }],
    levels: [{ id: 'lv1', gradeLevel: 5, departments: [{ id: 'd3', name: 'Seviye Zümre', subject: 'Türkçe', memberCount: 1, headLabel: null, headUserId: null, members: ['Öğr3'] }] }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } };
  h.api.departmentTree.mockResolvedValue(TREE);
  h.api.listSubjects.mockResolvedValue([{ id: 's1', name: 'Matematik' }]);
  h.api.createDepartment.mockResolvedValue({ id: 'dn' });
  h.api.assignMembers.mockResolvedValue({ assigned: 1, removed: 0 });
  h.api.deleteDepartment.mockResolvedValue({ ok: true });
  h.api.departmentMembers.mockResolvedValue({ candidates: [
    { id: 'su1', username: 'ANK-T-1', fullName: 'Ali', inDept: true, isHead: false },
    { id: 'su2', username: 'ANK-T-2', fullName: 'Veli', inDept: false, isHead: false, otherDept: 'Fen' },
  ] });
});

describe('SchoolDepartments', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    renderWithProviders(<SchoolDepartments />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('boş yapı → uyarı', async () => {
    h.api.departmentTree.mockResolvedValue({ schoolWide: [], branches: [] });
    renderWithProviders(<SchoolDepartments />);
    expect(await screen.findByText(/Henüz şube\/seviye yok/)).toBeInTheDocument();
  });

  it('ağacı render eder (tüm okul + şube + seviye zümreleri)', async () => {
    renderWithProviders(<SchoolDepartments />);
    expect(await screen.findByText('Genel Zümre')).toBeInTheDocument();
    expect(screen.getByText('Şube Zümre')).toBeInTheDocument();
    expect(screen.getByText('Seviye Zümre')).toBeInTheDocument();
    expect(screen.getByText('Tüm Okul (genel)')).toBeInTheDocument();
  });

  it('üye sayısı butonu → üyeleri açar', async () => {
    renderWithProviders(<SchoolDepartments />);
    await screen.findByText('Genel Zümre');
    const toggles = screen.getAllByTitle('Üyeleri göster/gizle');
    fireEvent.click(toggles[0]);
    expect(await screen.findByText('Öğr1')).toBeInTheDocument();
  });

  it('Genel Zümre Ekle → createDepartment (scope=school)', async () => {
    renderWithProviders(<SchoolDepartments />);
    await screen.findByText('Genel Zümre');
    fireEvent.click(screen.getByTitle('Genel Zümre Ekle'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Zümre adı'), { target: { value: 'Yeni Z' } });
    fireEvent.change(within(dialog).getByLabelText('ders-sec'), { target: { value: 'Matematik' } });
    fireEvent.submit(within(dialog).getByLabelText('Zümre adı').closest('form'));
    await waitFor(() => expect(h.api.createDepartment).toHaveBeenCalledWith({ name: 'Yeni Z', subject: 'Matematik' }));
  });

  it('Seviye Zümresi Ekle → createDepartment levelId taşır', async () => {
    renderWithProviders(<SchoolDepartments />);
    await screen.findByText('Seviye Zümre');
    fireEvent.click(screen.getByTitle('Seviye Zümresi Ekle'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Zümre adı'), { target: { value: 'Lev Z' } });
    fireEvent.change(within(dialog).getByLabelText('ders-sec'), { target: { value: 'Mat' } });
    fireEvent.submit(within(dialog).getByLabelText('Zümre adı').closest('form'));
    await waitFor(() => expect(h.api.createDepartment).toHaveBeenCalledWith({ name: 'Lev Z', subject: 'Mat', levelId: 'lv1' }));
  });

  it('Zümreyi Sil → onay → deleteDepartment', async () => {
    renderWithProviders(<SchoolDepartments />);
    await screen.findByText('Genel Zümre');
    fireEvent.click(screen.getAllByTitle('Zümreyi Sil')[0]);
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(h.api.deleteDepartment).toHaveBeenCalledWith('d1'));
  });

  it('Öğretmen/Başkan Ata dialog → seç + kaydet → assignMembers', async () => {
    renderWithProviders(<SchoolDepartments />);
    await screen.findByText('Genel Zümre');
    fireEvent.click(screen.getAllByTitle('Öğretmen / Başkan Ata')[0]);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('ANK-T-1')).toBeInTheDocument();
    // ikinci öğretmeni de ekle
    const checks = within(dialog).getAllByRole('checkbox');
    fireEvent.click(checks[1]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(h.api.assignMembers).toHaveBeenCalledWith('d1', expect.objectContaining({ schoolUserIds: expect.arrayContaining(['su1', 'su2']) })));
  });
});
