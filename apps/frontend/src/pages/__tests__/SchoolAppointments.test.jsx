/**
 * SchoolAppointments (Öğretmen randevu yönetimi) UI testi — randevu listesi +
 * durum aksiyonları (Onayla/Reddet/Tamamla/İptal) ve uygunluk düzenleyici.
 *
 * Uygunluk sekmesindeki gün seçici Radix Select'tir; testler varsayılan gün
 * (Pzt) + native time input'larıyla çalışır (Select sürücüsü gerektirmez).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import i18n from '@/lib/i18n';
import SchoolAppointments from '../SchoolAppointments';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } },
  api: {
    teacherList: vi.fn(),
    availability: vi.fn(),
    setAvailability: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ schoolAppointments: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const APPT = (over = {}) => ({
  id: 'ap1', studentName: 'Ali V', studentClassroom: '5-A', appointmentType: 'ACADEMIC',
  date: '2026-07-09', startTime: '09:00', endTime: '09:30', status: 'PENDING', notes: null, teacherNotes: null, createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  i18n.changeLanguage('tr');
  h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
  h.api.teacherList.mockResolvedValue({ items: [APPT()], total: 1, page: 1, pageSize: 20 });
  h.api.availability.mockResolvedValue({ slots: [] });
  h.api.setAvailability.mockResolvedValue({ slots: [] });
  h.api.updateStatus.mockResolvedValue({ id: 'ap1', status: 'CONFIRMED' });
});

describe('SchoolAppointments (öğretmen)', () => {
  it('öğretmen değil → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
    renderWithProviders(<SchoolAppointments />);
    expect(screen.getByText(i18n.t('school:common.accessDenied'))).toBeInTheDocument();
  });

  it('PENDING randevu → Onayla + Reddet butonları görünür', async () => {
    renderWithProviders(<SchoolAppointments />);
    expect(await screen.findByText('Ali V')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('school:appointments.confirm') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('school:appointments.reject') })).toBeInTheDocument();
  });

  it('Onayla tıklanınca updateStatus(CONFIRMED) çağrılır', async () => {
    renderWithProviders(<SchoolAppointments />);
    await screen.findByText('Ali V');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('school:appointments.confirm') }));
    await waitFor(() => expect(h.api.updateStatus).toHaveBeenCalledWith('ap1', { status: 'CONFIRMED' }));
  });

  it('CONFIRMED randevu → Tamamla + İptal butonları', async () => {
    h.api.teacherList.mockResolvedValue({ items: [APPT({ status: 'CONFIRMED' })], total: 1, page: 1, pageSize: 20 });
    renderWithProviders(<SchoolAppointments />);
    await screen.findByText('Ali V');
    expect(screen.getByRole('button', { name: i18n.t('school:appointments.complete') })).toBeInTheDocument();
  });

  it('CANCELLED randevu → aksiyon butonu YOK', async () => {
    h.api.teacherList.mockResolvedValue({ items: [APPT({ status: 'CANCELLED' })], total: 1, page: 1, pageSize: 20 });
    renderWithProviders(<SchoolAppointments />);
    await screen.findByText('Ali V');
    expect(screen.queryByRole('button', { name: i18n.t('school:appointments.confirm') })).toBeNull();
    expect(screen.queryByRole('button', { name: i18n.t('school:appointments.complete') })).toBeNull();
  });

  it('Uygunluk sekmesi: slot ekle → Kaydet → setAvailability çağrılır', async () => {
    renderWithProviders(<SchoolAppointments />);
    await screen.findByText('Ali V');
    // Uygunluk sekmesine geç
    fireEvent.click(screen.getByRole('button', { name: i18n.t('school:appointments.tabs.availability') }));
    // Varsayılan gün (Pzt) + 09:00-09:30 ile "Ekle"
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.addSlot') }));
    // Kaydet aktifleşir
    const saveBtn = screen.getByRole('button', { name: i18n.t('school:appointments.saveAvailability') });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(h.api.setAvailability).toHaveBeenCalledTimes(1));
    // Kaydedilen set en az 1 slot içerir
    expect(h.api.setAvailability.mock.calls[0][0].length).toBeGreaterThanOrEqual(1);
  });

  it('Uygunluk: aynı gün çakışan slot eklenince toast.error', async () => {
    h.api.availability.mockResolvedValue({ slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }] });
    renderWithProviders(<SchoolAppointments />);
    await screen.findByText('Ali V');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('school:appointments.tabs.availability') }));
    // Varsayılan 09:00-09:30, mevcut 09:00-10:00 ile çakışır
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('school:appointments.addSlot') }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
