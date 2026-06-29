import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentReports from '../StudentReports';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: { get: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ studentReport: h.api }));
// lazy StudentReportCharts'ı hafif bir stub ile değiştir
vi.mock('@/components/school/StudentReportCharts', () => ({ default: () => <div data-testid="charts" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.get.mockResolvedValue({
    level: 5,
    summary: { submissionCount: 3, avgPercent: 72, questionCount: 24 },
    bySubject: [{ name: 'Mat', avgPercent: 72, count: 3, questionCount: 24 }],
    byTopic: [{ name: 'Cebir', avgPercent: 72, count: 3, questionCount: 24 }],
    timeseries: [{ date: '2026-03-01', avgPercent: 72, count: 3, questionCount: 24 }],
  });
});

describe('StudentReports', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentReports />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });
  it('özet kartları + grafik (veri geldiğinde)', async () => {
    renderWithProviders(<StudentReports />);
    expect(await screen.findByTestId('charts')).toBeInTheDocument();
    expect(screen.getByText('%72')).toBeInTheDocument();
    expect(screen.getByText('5. Sınıf')).toBeInTheDocument();
    // Çözülen soru kartı (rapor önce hacmi gösterir)
    expect(screen.getByText('Çözülen soru')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });
  it('boş → "çözülmüş test yok"', async () => {
    h.api.get.mockResolvedValue({ level: null, summary: { submissionCount: 0, avgPercent: null, questionCount: 0 }, bySubject: [], byTopic: [], timeseries: [] });
    renderWithProviders(<StudentReports />);
    expect(await screen.findByText(/çözülmüş test yok/)).toBeInTheDocument();
  });
  it('varsayılan Test sekmesiyle sorgu yapılır', async () => {
    renderWithProviders(<StudentReports />);
    await screen.findByTestId('charts');
    expect(h.api.get).toHaveBeenCalledWith({ from: undefined, examType: 'TEST' });
  });
  it('Yazılı sekmesine geçince examType=WRITTEN ile sorgu', async () => {
    renderWithProviders(<StudentReports />);
    await screen.findByTestId('charts');
    fireEvent.click(screen.getByRole('button', { name: /Yazılı/ }));
    await waitFor(() => expect(h.api.get).toHaveBeenCalledWith({ from: undefined, examType: 'WRITTEN' }));
  });
});
