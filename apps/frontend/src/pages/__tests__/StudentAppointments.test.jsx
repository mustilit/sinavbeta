/**
 * StudentAppointments (Öğrenci randevu) UI testi — erişim, öğretmen boş durumu,
 * "Randevularım" sekmesinde iptal akışı ve durum-bazlı iptal butonu görünürlüğü.
 *
 * Rezervasyon akışı (öğretmen Radix Select → slot → dialog) jsdom'da kırılgan
 * olduğundan gerçek tarayıcı e2e'sinde kapsanır; burada iptal + liste + erişim
 * güvenilir biçimde test edilir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import i18n from '@/lib/i18n';
import StudentAppointments from '../StudentAppointments';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } },
  api: {
    teachers: vi.fn(),
    slots: vi.fn(),
    mine: vi.fn(),
    book: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ schoolAppointments: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MINE = (over = {}) => ({
  id: 'ap1', teacherName: 'Ada H', appointmentType: 'ACADEMIC',
  date: '2026-07-09', startTime: '09:00', endTime: '09:30', status: 'CONFIRMED', teacherNotes: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  i18n.changeLanguage('tr');
  h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
  h.api.teachers.mockResolvedValue({ teachers: [] });
  h.api.slots.mockResolvedValue({ teacherName: '', days: [] });
  h.api.mine.mockResolvedValue({ items: [MINE()] });
  h.api.cancel.mockResolvedValue({ ok: true });
});

describe('StudentAppointments (öğrenci)', () => {
  it('öğrenci değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
    renderWithProviders(<StudentAppointments />);
    expect(screen.getByText(i18n.t('school:common.accessDenied'))).toBeInTheDocument();
  });

  it('randevu veren öğretmen yoksa bilgilendirme metni', async () => {
    renderWithProviders(<StudentAppointments />);
    expect(await screen.findByText(i18n.t('school:appointments.noTeachers'))).toBeInTheDocument();
  });

  it('Randevularım sekmesi: CONFIRMED randevu + İptal Et butonu', async () => {
    renderWithProviders(<StudentAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.tabs.mine') }));
    expect(await screen.findByText('Ada H')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('school:appointments.cancel') })).toBeInTheDocument();
  });

  it('İptal Et tıklanınca cancel(id) çağrılır', async () => {
    renderWithProviders(<StudentAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.tabs.mine') }));
    await screen.findByText('Ada H');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('school:appointments.cancel') }));
    await waitFor(() => expect(h.api.cancel).toHaveBeenCalledWith('ap1'));
  });

  it('COMPLETED randevu → İptal Et butonu YOK', async () => {
    h.api.mine.mockResolvedValue({ items: [MINE({ status: 'COMPLETED' })] });
    renderWithProviders(<StudentAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.tabs.mine') }));
    await screen.findByText('Ada H');
    expect(screen.queryByRole('button', { name: i18n.t('school:appointments.cancel') })).toBeNull();
  });

  it('hiç randevu yoksa boş durum metni', async () => {
    h.api.mine.mockResolvedValue({ items: [] });
    renderWithProviders(<StudentAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.tabs.mine') }));
    expect(await screen.findByText(i18n.t('school:appointments.emptyMine'))).toBeInTheDocument();
  });
});
