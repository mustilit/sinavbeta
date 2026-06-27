/**
 * SchoolExamPool (Sınav Havuzu) UI testleri
 * Kapsam: başlık, Zümre + Seviye filtreleri, sınav satırları, silme YOK (yalnız Pasife al).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SchoolExamPool from '../SchoolExamPool';

vi.mock('@/api/dalClient', () => ({
  school: {
    exams: {
      list: vi.fn().mockResolvedValue([]),
      archive: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', school: { schoolRole: 'TEACHER' } } }),
}));

vi.mock('@/lib/navigation', () => ({
  useAppNavigate: () => vi.fn(),
  buildPageUrl: (name, params) => `/${name}${params ? '?' + new URLSearchParams(params) : ''}`,
}));

const EXAMS = [
  { id: 'e1', title: 'Matematik TEST 1', examType: 'TEST', subject: 'Matematik', gradeLevel: 5, questionCount: 10, totalPoints: 10, poolVisibility: 'SCHOOL', isArchived: false, departmentName: 'Matematik Zümresi', createdByUsername: 'ALEF-T-0004', canManage: true },
  { id: 'e2', title: 'Türkçe WRITTEN 2', examType: 'WRITTEN', subject: 'Türkçe', gradeLevel: 7, questionCount: 10, totalPoints: 10, poolVisibility: 'DEPARTMENT', isArchived: false, departmentName: 'Türkçe Zümresi', createdByUsername: 'ALEF-T-0003', canManage: true },
];

function renderPool() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/SchoolExamPool']}>
        <SchoolExamPool />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { school } = await import('@/api/dalClient');
  school.exams.list.mockResolvedValue(EXAMS);
});

describe('SchoolExamPool — Sınav Havuzu', () => {
  it('başlık render edilir', async () => {
    renderPool();
    expect(await screen.findByRole('heading', { level: 1, name: /Sınav Havuzu/i })).toBeInTheDocument();
  });

  it('Zümre ve Seviye filtreleri render edilir', async () => {
    renderPool();
    await screen.findByText('Matematik TEST 1');
    // Radix Select varsayılan değer metinleri (value="all")
    expect(screen.getByText('Tüm zümreler')).toBeInTheDocument();
    expect(screen.getByText('Tüm seviyeler')).toBeInTheDocument();
    // En az 3 combobox (tür + zümre + seviye)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(3);
  });

  it('sınav satırları listelenir', async () => {
    renderPool();
    expect(await screen.findByText('Matematik TEST 1')).toBeInTheDocument();
    expect(screen.getByText('Türkçe WRITTEN 2')).toBeInTheDocument();
  });

  it('silme butonu YOK; yalnız Pasife al ve Düzenle var', async () => {
    renderPool();
    const title = await screen.findByText('Matematik TEST 1');
    const row = title.closest('div[class*="rounded-xl"]');
    expect(row).toBeTruthy();
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(2); // Düzenle + Pasife al (silme kaldırıldı)
    expect(within(row).getByText('Düzenle')).toBeInTheDocument();
    expect(within(row).getByText('Pasife al')).toBeInTheDocument();
    // Eski "Arşivle" etiketi gitti
    expect(screen.queryByText('Arşivle')).toBeNull();
  });

  it('arşivli sınav "Aktife al" + "Pasif" rozeti gösterir', async () => {
    const { school } = await import('@/api/dalClient');
    school.exams.list.mockResolvedValue([{ ...EXAMS[0], isArchived: true }]);
    renderPool();
    expect(await screen.findByText('Aktife al')).toBeInTheDocument();
    expect(screen.getByText('Pasif')).toBeInTheDocument();
  });
});
