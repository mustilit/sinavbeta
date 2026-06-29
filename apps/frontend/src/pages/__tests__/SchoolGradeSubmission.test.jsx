import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolGradeSubmission from '../SchoolGradeSubmission';

const h = vi.hoisted(() => ({
  api: { grading: { get: vi.fn(), grade: vi.fn() } },
  nav: vi.fn(),
}));
vi.mock('@/api/dalClient', () => ({ school: h.api }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => h.nav, buildPageUrl: (n, p) => `/${n}?${new URLSearchParams(p || {})}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SUB = {
  assignmentTitle: 'Yazılı 1', status: 'SUBMITTED',
  student: { username: 'ANK-S-1', name: 'Ali' }, feedback: '',
  questions: [
    { questionId: 'q1', content: 'Soru 1', points: 10, textAnswer: 'Cevabım', imageUrls: ['http://i/a.png'], solutionText: 'Referans', earnedPoints: null },
    { questionId: 'q2', content: 'Soru 2', points: 5, textAnswer: '', imageUrls: [], earnedPoints: 3 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.api.grading.get.mockResolvedValue(SUB);
  h.api.grading.grade.mockResolvedValue({ totalScore: 12, maxScore: 15 });
});
const render = () => renderWithProviders(<SchoolGradeSubmission />, { route: '/SchoolGradeSubmission?id=sub1' });

describe('SchoolGradeSubmission', () => {
  it('teslim yoksa → bulunamadı', async () => {
    h.api.grading.get.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText('Teslim bulunamadı')).toBeInTheDocument();
  });

  it('teslim yüklenir → sorular + öğrenci cevabı + çözüm', async () => {
    render();
    expect(await screen.findByText('Soru 1')).toBeInTheDocument();
    expect(screen.getByText('Cevabım')).toBeInTheDocument();
    expect(screen.getByText('Referans')).toBeInTheDocument();
    expect(screen.getByText('— metin yok —')).toBeInTheDocument(); // q2 boş cevap
  });

  it('puan gir → toplam güncellenir → Kaydet → grade', async () => {
    render();
    await screen.findByText('Soru 1');
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '8' } });
    expect(screen.getByText(/Toplam: 11\/15/)).toBeInTheDocument(); // 8 + (q2 init 3)
    fireEvent.click(screen.getByRole('button', { name: /Değerlendirmeyi Kaydet/ }));
    await waitFor(() => expect(h.api.grading.grade).toHaveBeenCalledWith('sub1', expect.objectContaining({
      grades: expect.arrayContaining([{ questionId: 'q1', earnedPoints: 8 }, { questionId: 'q2', earnedPoints: 3 }]),
    })));
    await waitFor(() => expect(h.nav).toHaveBeenCalledWith(-1));
  });
});
