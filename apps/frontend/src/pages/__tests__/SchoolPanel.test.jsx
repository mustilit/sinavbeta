import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import SchoolPanel from '../SchoolPanel';

const h = vi.hoisted(() => ({
  user: { user: null },
  api: { quota: vi.fn(), panelStats: vi.fn() },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));

const setRole = (schoolRole) => { h.user = { user: schoolRole ? { id: 'u1', school: { schoolRole, schoolName: 'Test Okulu' } } : null }; };

beforeEach(() => {
  vi.clearAllMocks();
  h.api.quota.mockResolvedValue({ usedUsers: 5, maxUsers: 100, remainingUsers: 95, usedLiveCount: 1, annualLiveLimit: 10, remainingLive: 9 });
  h.api.panelStats.mockResolvedValue({ teachers: 4, students: 30, branches: 2, levels: 6, classrooms: 10, departments: 3, subjects: 8, exams: 12, liveSessions: 1, assignments: 7 });
});

describe('SchoolPanel', () => {
  it('okul rolü yoksa → Erişim yok', () => {
    setRole(null);
    renderWithProviders(<SchoolPanel />);
    expect(screen.getByText('Erişim yok')).toBeInTheDocument();
  });

  it('öğretmen → 2 hızlı erişim kartı (Sınav Havuzu + Canlı Test)', () => {
    setRole('TEACHER');
    renderWithProviders(<SchoolPanel />);
    expect(screen.getByText('Sınav Havuzu')).toBeInTheDocument();
    expect(screen.getByText('Canlı Test')).toBeInTheDocument();
    expect(screen.getByText(/Öğretmen paneli/)).toBeInTheDocument();
  });

  it('öğrenci → "Merhaba" karşılama', () => {
    setRole('STUDENT');
    renderWithProviders(<SchoolPanel />);
    expect(screen.getByText(/Merhaba/)).toBeInTheDocument();
  });

  it('okul yöneticisi → kota + 8 yönetim kartı (stats geldiğinde)', async () => {
    setRole('SCHOOL_ADMIN');
    renderWithProviders(<SchoolPanel />);
    expect(await screen.findByText('Kullanıcılar')).toBeInTheDocument();
    expect(screen.getByText('Şubeler & Sınıflar')).toBeInTheDocument();
    expect(screen.getByText('Raporlar')).toBeInTheDocument();
    // kota kartı doldu
    expect(await screen.findByText('5/100')).toBeInTheDocument();
    expect(screen.getByText(/4 öğretmen · 30 öğrenci/)).toBeInTheDocument();
  });

  it('okul yöneticisi + stats/quota gelmemiş → "…" placeholder', () => {
    setRole('SCHOOL_ADMIN');
    h.api.quota.mockReturnValue(new Promise(() => {})); // hiç çözülmez
    h.api.panelStats.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SchoolPanel />);
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });
});
