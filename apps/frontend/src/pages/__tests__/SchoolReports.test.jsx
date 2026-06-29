import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolReports from '../SchoolReports';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN', schoolName: 'Okul' } } },
  api: {
    listClassrooms: vi.fn(), listDepartments: vi.fn(),
    reports: { breakdown: vi.fn(), classroom: vi.fn() },
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/school/ReportCharts', () => ({ default: ({ tab }) => <div data-testid="charts">{tab}</div> }));
// xlsx'i mock'la — exportExcel gerçek dosya yazmasın (jsdom'da diske artefakt bırakır)
vi.mock('xlsx', () => ({
  utils: { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: () => {} },
  writeFile: () => {},
}));
vi.mock('@/components/school/PeriodSelect', () => ({
  PeriodSelect: ({ value, onChange }) => (
    <button type="button" onClick={() => onChange('p1')}>dönem:{value || 'yok'}</button>
  ),
}));

const BREAKDOWN = {
  branches: [{ id: 'b1', name: 'Merkez', classroomCount: 2, studentCount: 30, submissionCount: 50, avgPercent: 75 }],
  levels: [{ gradeLevel: 5, classroomCount: 1, studentCount: 15, submissionCount: 20, avgPercent: 60 }],
  classrooms: [{ id: 'c1', name: '5-A', branchName: 'Merkez', gradeLevel: 5, studentCount: 15, assignmentCount: 4, submissionCount: 20, avgPercent: 60 }],
  byDepartment: [], timeseries: [],
  highlights: { bestBranch: { name: 'Merkez', avgPercent: 75 }, bestClassByLevel: [{ gradeLevel: 5, classroom: { name: '5-A', branchName: 'Merkez', avgPercent: 60 } }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'SCHOOL_ADMIN', schoolName: 'Okul' } } };
  h.api.listClassrooms.mockResolvedValue([{ id: 'c1', name: '5-A', gradeLevel: 5 }]);
  h.api.listDepartments.mockResolvedValue([{ id: 'd1', name: 'Mat' }]);
  h.api.reports.breakdown.mockResolvedValue(BREAKDOWN);
  h.api.reports.classroom.mockResolvedValue({
    classroom: { studentCount: 15 }, summary: { submissionCount: 20, avgPercent: 60 },
    students: [{ name: 'Ali', submissionCount: 4, avgPercent: 80 }],
    assignments: [{ title: 'Ödev 1', department: 'Mat', submissionCount: 10, avgPercent: 70 }],
    departments: [{ name: 'Mat', submissionCount: 10, avgPercent: 70 }],
  });
});

describe('SchoolReports', () => {
  it('yetkisiz rol → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
    renderWithProviders(<SchoolReports />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('dönem seçilince breakdown çağrılır + şube tablosu', async () => {
    renderWithProviders(<SchoolReports />);
    fireEvent.click(screen.getByText(/dönem:/));
    expect(await screen.findByTestId('charts')).toBeInTheDocument();
    expect((await screen.findAllByText('Merkez')).length).toBeGreaterThan(0);
    expect(screen.getByText('En İyi Şube')).toBeInTheDocument();
  });

  it('sekme değişimi: Seviyeler → Sınıflar', async () => {
    renderWithProviders(<SchoolReports />);
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByTestId('charts');
    fireEvent.click(screen.getByRole('button', { name: /Seviyeler/ }));
    expect(await screen.findByText('5. Seviye')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sınıflar/ }));
    expect(await screen.findByText('5-A')).toBeInTheDocument();
  });

  it('sınıf satırına tıklayınca detay diyaloğu açılır', async () => {
    renderWithProviders(<SchoolReports />);
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByTestId('charts');
    fireEvent.click(screen.getByRole('button', { name: /Sınıflar/ }));
    fireEvent.click(await screen.findByText('5-A'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Öğrenci başarısı')).toBeInTheDocument();
    expect(within(dialog).getByText('Ali')).toBeInTheDocument();
  });

  it('Excel butonu hata yutar (xlsx import jsdom)', async () => {
    renderWithProviders(<SchoolReports />);
    fireEvent.click(screen.getByText(/dönem:/));
    await screen.findByTestId('charts');
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    // exportExcel try/catch → patlamamalı
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
  });
});
