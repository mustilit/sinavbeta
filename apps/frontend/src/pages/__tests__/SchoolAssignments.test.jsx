/**
 * SchoolAssignments (Ödevler) UI testi — "Yeni Ödev Ata" diyaloğunda sınıfların gelmesi.
 * Regresyon: öğretmen ödev atarken sınıf listesi boş ("Sınıf yok.") gelmemeli.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SchoolAssignments from '../SchoolAssignments';

vi.mock('@/api/dalClient', () => ({
  school: {
    assignments: { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ created: 0 }) },
    exams: { list: vi.fn().mockResolvedValue([]) },
    listClassrooms: vi.fn().mockResolvedValue([
      { id: 'c1', name: '5-A', gradeLevel: 5, studentCount: 10 },
      { id: 'c2', name: '5-B', gradeLevel: 5, studentCount: 9 },
    ]),
  },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', school: { schoolRole: 'TEACHER' } } }),
}));

vi.mock('@/lib/navigation', () => ({
  useAppNavigate: () => vi.fn(),
  buildPageUrl: (name) => `/${name}`,
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/SchoolAssignments']}>
        <SchoolAssignments />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('SchoolAssignments — Yeni Ödev diyaloğu', () => {
  it('öğretmen için "Yeni Ödev" butonu görünür', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Yeni Ödev/i })).toBeInTheDocument();
  });

  it('diyalog açılınca sınıflar listelenir ("Sınıf yok." görünmez)', async () => {
    renderPage();
    const btn = await screen.findByRole('button', { name: /Yeni Ödev/i });
    fireEvent.click(btn);
    // listClassrooms sonucu diyalogda render edilmeli
    expect(await screen.findByText('5-A')).toBeInTheDocument();
    expect(screen.getByText('5-B')).toBeInTheDocument();
    expect(screen.queryByText('Sınıf yok.')).toBeNull();
    const { school } = await import('@/api/dalClient');
    expect(school.listClassrooms).toHaveBeenCalled();
  });
});
