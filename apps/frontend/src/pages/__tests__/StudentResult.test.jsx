import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import StudentResult from '../StudentResult';

const h = vi.hoisted(() => ({ api: { result: vi.fn() }, nav: vi.fn() }));
vi.mock('@/api/dalClient', () => ({ studentAssignments: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n) => `/${n}` }));

beforeEach(() => vi.clearAllMocks());
const render = () => renderWithProviders(<StudentResult />, { route: '/StudentResult?id=a1' });

describe('StudentResult', () => {
  it('sonuç bulunamadı (hata)', async () => {
    h.api.result.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText('Sonuç bulunamadı')).toBeInTheDocument();
  });
  it('sonuç gizli → bilgilendirme', async () => {
    h.api.result.mockResolvedValue({ visible: false, reason: 'TEACHER_RELEASE', status: 'SUBMITTED' });
    render();
    expect(await screen.findByText('Sonuç henüz görünmüyor')).toBeInTheDocument();
  });
  it('TEST sonucu: skor + doğru/yanlış işaretleri', async () => {
    h.api.result.mockResolvedValue({
      visible: true, examType: 'TEST', totalScore: 8, maxScore: 10,
      questions: [{ id: 'q1', content: 'Soru 1', solutionText: 'açıklama', selectedOptionId: 'o2',
        options: [{ id: 'o1', content: 'A', isCorrect: true }, { id: 'o2', content: 'B', isCorrect: false }] }],
    });
    render();
    expect(await screen.findByText('Soru 1')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/Açıklama:/)).toBeInTheDocument();
  });
  it('WRITTEN sonucu: cevap + çözüm + foto + puan', async () => {
    h.api.result.mockResolvedValue({
      visible: true, examType: 'WRITTEN', status: 'GRADED', totalScore: 7, maxScore: 10, feedback: 'iyi',
      questions: [{ id: 'q1', content: 'Yazılı soru', textAnswer: 'cevabım', imageUrls: ['http://x/img.png'], solutionText: 'çözüm', earnedPoints: 7, points: 10 }],
    });
    render();
    expect(await screen.findByText('Yazılı soru')).toBeInTheDocument();
    expect(screen.getByText('cevabım')).toBeInTheDocument();
    expect(screen.getAllByText(/Puan: 7\/10/).length).toBeGreaterThan(0);
    expect(screen.getByText(/"iyi"/)).toBeInTheDocument();
  });
});
