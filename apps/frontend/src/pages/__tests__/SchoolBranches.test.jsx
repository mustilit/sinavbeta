import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolBranches from '../SchoolBranches';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } },
  api: {
    tree: vi.fn(), createBranch: vi.fn(), createLevel: vi.fn(), createClassroom: vi.fn(),
    bulkCreateStudents: vi.fn(), assignBranchAdmin: vi.fn(), assignLevelAdmin: vi.fn(), assignClassroomAdmin: vi.fn(),
    deleteLevel: vi.fn(), deleteClassroom: vi.fn(), setClassroomActive: vi.fn(),
    listUsers: vi.fn(), assignStudents: vi.fn(), removeStudents: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/school/studentImport', () => ({
  parseStudentRows: vi.fn(async () => [{ firstName: 'A', lastName: 'B' }]),
  downloadStudentTemplate: vi.fn(),
  BulkCredentialsDialog: ({ creds }) => (creds ? <div data-testid="bulk-creds" /> : null),
}));

const TREE = [{
  id: 'b1', name: 'Merkez Şube', adminLabel: 'Müdür', levels: [{
    id: 'lv1', gradeLevel: 5, adminUserId: null, adminLabel: null, classrooms: [
      { id: 'c1', name: '5-A', adminUserId: null, adminLabel: null, studentCount: 3, isActive: true },
    ],
  }],
}];

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN' } } };
  h.api.tree.mockResolvedValue(TREE);
  h.api.createBranch.mockResolvedValue({ id: 'b2' });
  h.api.createLevel.mockResolvedValue({ id: 'lv2' });
  h.api.createClassroom.mockResolvedValue({ id: 'c2' });
  h.api.deleteLevel.mockResolvedValue({ ok: true });
  h.api.setClassroomActive.mockResolvedValue({ isActive: false });
  h.api.listUsers.mockResolvedValue({ items: [{ id: 'su1', username: 'ANK-T-1', fullName: 'Öğr', classroomId: null }] });
  h.api.assignStudents.mockResolvedValue({ assigned: 1 });
  h.api.removeStudents.mockResolvedValue({ removed: 1 });
});

describe('SchoolBranches', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    renderWithProviders(<SchoolBranches />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('boş ağaç → "Henüz şube yok"', async () => {
    h.api.tree.mockResolvedValue([]);
    renderWithProviders(<SchoolBranches />);
    expect(await screen.findByText(/Henüz şube yok/)).toBeInTheDocument();
  });

  it('ağacı render eder (şube → seviye → sınıf)', async () => {
    renderWithProviders(<SchoolBranches />);
    expect(await screen.findByText('Merkez Şube')).toBeInTheDocument();
    expect(screen.getByText('5. Seviye')).toBeInTheDocument();
    expect(screen.getByText('5-A')).toBeInTheDocument();
  });

  it('Şube Ekle → createBranch', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('Merkez Şube');
    fireEvent.click(screen.getByRole('button', { name: /Şube Ekle/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Şube adı'), { target: { value: 'Yeni Şube' } });
    fireEvent.submit(within(dialog).getByLabelText('Şube adı').closest('form'));
    await waitFor(() => expect(h.api.createBranch).toHaveBeenCalledWith({ name: 'Yeni Şube' }, expect.anything()));
  });

  it('Seviye Ekle → createLevel', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('Merkez Şube');
    fireEvent.click(screen.getByTitle('Seviye Ekle'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.submit(within(dialog).getByText(/Seviye Ekle —/).closest('div').querySelector('form') || within(dialog).getByRole('button', { name: 'Ekle' }).closest('form'));
    await waitFor(() => expect(h.api.createLevel).toHaveBeenCalledWith({ branchId: 'b1', gradeLevel: 5 }));
  });

  it('Sınıf Ekle → createClassroom', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('5. Seviye');
    fireEvent.click(screen.getByTitle('Sınıf Ekle'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Sınıf adı'), { target: { value: '5-B' } });
    fireEvent.submit(within(dialog).getByLabelText('Sınıf adı').closest('form'));
    await waitFor(() => expect(h.api.createClassroom).toHaveBeenCalledWith({ levelId: 'lv1', name: '5-B' }));
  });

  it('Seviyeyi Sil → onay → deleteLevel', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('5. Seviye');
    fireEvent.click(screen.getByTitle('Seviyeyi Sil'));
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(h.api.deleteLevel).toHaveBeenCalledWith('lv1'));
  });

  it('sınıf Pasife al → setClassroomActive', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('5-A');
    fireEvent.click(screen.getByTitle('Pasife al'));
    await waitFor(() => expect(h.api.setClassroomActive).toHaveBeenCalledWith('c1', false));
  });

  it('Öğrenci Ekle/Çıkar dialog: roster + aday listesi + ekle/çıkar', async () => {
    h.api.listUsers.mockResolvedValue({ items: [
      { id: 's1', username: 'ANK-S-1', fullName: 'Ali', classroomId: 'c1' },   // roster
      { id: 's2', username: 'ANK-S-2', fullName: 'Veli', classroomId: null },  // candidate
    ] });
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('5-A');
    fireEvent.click(screen.getByTitle('Öğrenci Ekle/Çıkar'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('ANK-S-1')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTitle('Sınıftan çıkar'));
    await waitFor(() => expect(h.api.removeStudents).toHaveBeenCalledWith('c1', ['s1']));
    fireEvent.click(within(dialog).getByTitle('Sınıfa ekle'));
    await waitFor(() => expect(h.api.assignStudents).toHaveBeenCalledWith('c1', ['s2']));
  });

  it('Yönetici ata dialog: seçimsiz submit → uyarı (render)', async () => {
    renderWithProviders(<SchoolBranches />);
    await screen.findByText('Merkez Şube');
    fireEvent.click(screen.getByTitle('Şube Yöneticisi Ata'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Şube Yöneticisi Ata —/)).toBeInTheDocument();
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Ata' }).closest('form'));
    // seçim yok → assignBranchAdmin çağrılmaz
    await waitFor(() => expect(h.api.assignBranchAdmin).not.toHaveBeenCalled());
  });
});
