import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolAssignmentReport from '../SchoolAssignmentReport';

const h = vi.hoisted(() => ({
  api: { assignments: { report: vi.fn() } },
  nav: vi.fn(),
}));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));

const REPORT = {
  title: 'Ödev 1', examTitle: 'Sınav A', examType: 'WRITTEN', classroomName: '5-A', maxPoints: 20,
  stats: { submissionRate: 75, submittedCount: 15, totalStudents: 20, avgScore: 14, maxScore: 19, minScore: 6 },
  showResultAfter: 'TEACHER_RELEASE', resultsReleased: false,
  submissions: [
    { id: 'sub1', studentUsername: 'ANK-S-1', studentName: 'Ali', status: 'SUBMITTED', totalScore: null, maxScore: 20, submittedAt: '2026-03-01T10:00:00Z' },
    { id: 'sub2', studentUsername: 'ANK-S-2', studentName: null, status: 'GRADED', totalScore: 18, maxScore: 20, submittedAt: '2026-03-02T11:00:00Z' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.api.assignments.report.mockResolvedValue(REPORT);
});
const render = () => renderWithProviders(<SchoolAssignmentReport />, { route: '/SchoolAssignmentReport?id=a1' });

describe('SchoolAssignmentReport', () => {
  it('rapor yoksa → bulunamadı', async () => {
    h.api.assignments.report.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText('Rapor bulunamadı')).toBeInTheDocument();
  });

  it('rapor yüklenir → istatistik + öğrenci tablosu', async () => {
    render();
    expect(await screen.findByText('Ödev 1')).toBeInTheDocument();
    expect(screen.getByText('%75')).toBeInTheDocument();
    expect(screen.getByText('ANK-S-1')).toBeInTheDocument();
    expect(screen.getByText('Teslim (puanlanacak)')).toBeInTheDocument();
    expect(screen.getByText('Puanlandı')).toBeInTheDocument();
  });

  it('WRITTEN: Değerlendir → SchoolGradeSubmission', async () => {
    render();
    await screen.findByText('Ödev 1');
    fireEvent.click(screen.getByRole('button', { name: 'Değerlendir' }));
    expect(h.nav).toHaveBeenCalledWith(expect.stringContaining('SchoolGradeSubmission'));
  });

  it('boş teslim → "Henüz teslim yok"', async () => {
    h.api.assignments.report.mockResolvedValue({ ...REPORT, submissions: [] });
    render();
    expect(await screen.findByText('Henüz teslim yok.')).toBeInTheDocument();
  });
});
