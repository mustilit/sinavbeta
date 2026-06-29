/**
 * SchoolAssignments (Ödevler) UI testi — liste, satır işlemleri ve "Yeni Ödev Ata" diyaloğu.
 * Regresyon: öğretmen ödev atarken sınıf listesi boş ("Sınıf yok.") gelmemeli.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolAssignments from '../SchoolAssignments';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } },
  api: {
    assignments: { list: vi.fn(), create: vi.fn(), releaseResults: vi.fn(), setStatus: vi.fn(), options: vi.fn() },
    exams: { list: vi.fn() },
    listClassrooms: vi.fn(),
  },
  nav: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/school/PeriodSelect', () => ({
  PeriodSelect: ({ value, onChange }) => <button type="button" onClick={() => onChange('p1')}>dönem:{value || 'yok'}</button>,
}));

const ROWS = [
  { id: 'a1', title: 'Ödev A', status: 'ACTIVE', classroomName: '5-A', dueDate: '2026-03-10T10:00:00Z', submissionCount: 3, showResultAfter: 'TEACHER_RELEASE', resultsReleased: false },
  { id: 'a2', title: 'Ödev B', status: 'CLOSED', classroomName: '5-B', dueDate: '2026-03-11T10:00:00Z', submissionCount: 5, showResultAfter: 'SUBMIT', resultsReleased: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
  h.api.assignments.list.mockResolvedValue(ROWS);
  h.api.assignments.create.mockResolvedValue({ created: 1 });
  h.api.assignments.releaseResults.mockResolvedValue({ ok: true });
  h.api.assignments.setStatus.mockResolvedValue({ ok: true });
  h.api.assignments.options.mockResolvedValue({ levels: [{ gradeLevel: 5 }], subjects: [{ name: 'Mat' }] });
  h.api.exams.list.mockResolvedValue([{ id: 'ex1', title: 'Sınav 1', gradeLevel: 5, subject: 'Mat', examType: 'TEST', questionCount: 5, isArchived: false }]);
  h.api.listClassrooms.mockResolvedValue([
    { id: 'c1', name: '5-A', gradeLevel: 5, studentCount: 10 },
    { id: 'c2', name: '5-B', gradeLevel: 5, studentCount: 9 },
  ]);
});

describe('SchoolAssignments', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('dönem seçilince ödev listesi + satır işlemleri', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    fireEvent.click(screen.getByText(/dönem:/));
    expect(await screen.findByText('Ödev A')).toBeInTheDocument();
    expect(screen.getByText('Ödev B')).toBeInTheDocument();
    // a1 (ACTIVE, TEACHER_RELEASE) → Yayımla + Kapat
    fireEvent.click(screen.getByRole('button', { name: /Yayımla/ }));
    await waitFor(() => expect(h.api.assignments.releaseResults).toHaveBeenCalledWith('a1'));
    fireEvent.click(screen.getByRole('button', { name: /Kapat/ }));
    await waitFor(() => expect(h.api.assignments.setStatus).toHaveBeenCalledWith('a1', 'CLOSED'));
    // a2 (CLOSED) → Aç
    fireEvent.click(screen.getByRole('button', { name: /Aç/ }));
    await waitFor(() => expect(h.api.assignments.setStatus).toHaveBeenCalledWith('a2', 'ACTIVE'));
  });

  it('Rapor → SchoolAssignmentReport', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByText('Ödev A');
    fireEvent.click(screen.getAllByRole('button', { name: /Rapor/ })[0]);
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('SchoolAssignmentReport'));
  });

  it('boş liste → "Henüz ödev yok"', async () => {
    h.api.assignments.list.mockResolvedValue([]);
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    fireEvent.click(screen.getByText(/dönem:/));
    expect(await screen.findByText(/Henüz ödev yok/)).toBeInTheDocument();
  });

  it('Yeni Ödev diyaloğu: sınıflar listelenir ("Sınıf yok." görünmez)', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    fireEvent.click(await screen.findByRole('button', { name: /Yeni Ödev/ }));
    expect(await screen.findByText('5-A')).toBeInTheDocument();
    expect(screen.getByText('5-B')).toBeInTheDocument();
    expect(screen.queryByText('Sınıf yok.')).toBeNull();
  });

  it('diyalogda sınav seçmeden Ata → uyarı', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments' });
    fireEvent.click(await screen.findByRole('button', { name: /Yeni Ödev/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Ata' }).closest('form'));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sınav seçin'));
  });

  it('preset examId → dialog ön-doldurulur → sınıf seç + tarih → Ata → create', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments?examId=ex1' });
    const dialog = await screen.findByRole('dialog');
    // ön-doldurulan sınıflar görünür
    const cb = await within(dialog).findByText('5-A');
    fireEvent.click(within(cb.closest('label')).getByRole('checkbox'));
    fireEvent.change(document.getElementById('dd'), { target: { value: '2026-04-01T12:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ata' }));
    await waitFor(() => expect(h.api.assignments.create).toHaveBeenCalledWith(expect.objectContaining({ examId: 'ex1', classroomIds: ['c1'] })));
  });

  it('"Tümünü seç" tüm sınıfları işaretler', async () => {
    renderWithProviders(<SchoolAssignments />, { route: '/SchoolAssignments?examId=ex1' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('5-A');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tümünü seç' }));
    const checks = within(dialog).getAllByRole('checkbox');
    // sınıf checkbox'ları (geç teslim hariç) işaretli
    expect(checks.filter((c) => c.checked).length).toBeGreaterThanOrEqual(2);
  });
});
