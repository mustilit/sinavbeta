/**
 * SchoolNotifications (Bildirimler) UI testi — liste, tab/tür filtresi, okundu
 * işaretleme ve "Mesaj Gönder" diyaloğu.
 *
 * Regresyon kilidi: mesaj gönderiminde hata (429/başka) → toast.error gösterilir
 * VE dialog AÇIK kalır (canlıda yaşanan "Gönderilemedi" senaryosu).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import i18n from '@/lib/i18n';
import SchoolNotifications from '../SchoolNotifications';

const h = vi.hoisted(() => ({
  user: { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } },
  api: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    messageTargets: vi.fn(),
    sendMessage: vi.fn(),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => h.user }));
vi.mock('@/api/dalClient', () => ({ schoolNotifications: h.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function page(items = [], unreadCount = 0, nextCursor = null) {
  return { items, unreadCount, nextCursor };
}

beforeEach(() => {
  vi.clearAllMocks();
  i18n.changeLanguage('tr');
  h.user = { user: { id: 'u1', school: { schoolRole: 'TEACHER' } } };
  h.api.list.mockResolvedValue(page([
    { id: 'n1', type: 'MESSAGE', title: 'Duyuru', body: 'metin', isRead: false, createdAt: new Date().toISOString(), sender: { firstName: 'Ada', lastName: 'H', username: 'T1' } },
    { id: 'n2', type: 'NEW_ASSIGNMENT', title: 'Yeni ödev: X', body: null, isRead: true, createdAt: new Date().toISOString(), sender: null },
  ], 1));
  h.api.messageTargets.mockResolvedValue({ classrooms: [{ id: 'c1', name: '5-A' }] });
  h.api.markRead.mockResolvedValue({ ok: true });
  h.api.markAllRead.mockResolvedValue({ updated: 1 });
  h.api.sendMessage.mockResolvedValue({ sent: 12 });
});

describe('SchoolNotifications', () => {
  it('rol yoksa → Erişim yok', () => {
    h.user = { user: { id: 'u1', school: null } };
    renderWithProviders(<SchoolNotifications />);
    expect(screen.getByText(i18n.t('school:common.accessDenied'))).toBeInTheDocument();
  });

  it('bildirim listesi render edilir (başlık + gönderen)', async () => {
    renderWithProviders(<SchoolNotifications />);
    expect(await screen.findByText('Duyuru')).toBeInTheDocument();
    expect(screen.getByText('Yeni ödev: X')).toBeInTheDocument();
  });

  it('personel (öğretmen) "Mesaj Gönder" butonunu görür', async () => {
    renderWithProviders(<SchoolNotifications />);
    expect(await screen.findByRole('button', { name: /mesaj gönder/i })).toBeInTheDocument();
  });

  it('öğrenci "Mesaj Gönder" butonunu GÖRMEZ', async () => {
    h.user = { user: { id: 'u1', school: { schoolRole: 'STUDENT' } } };
    renderWithProviders(<SchoolNotifications />);
    await screen.findByText('Duyuru');
    expect(screen.queryByRole('button', { name: /mesaj gönder/i })).toBeNull();
  });

  it('okunmamış bildirime tıklayınca markRead çağrılır', async () => {
    renderWithProviders(<SchoolNotifications />);
    const item = await screen.findByText('Duyuru');
    fireEvent.click(item);
    await waitFor(() => expect(h.api.markRead).toHaveBeenCalledWith('n1'));
  });

  it('unreadCount>0 iken "Tümünü okundu" görünür ve çalışır', async () => {
    renderWithProviders(<SchoolNotifications />);
    const btn = await screen.findByRole('button', { name: /tümünü okundu/i });
    fireEvent.click(btn);
    await waitFor(() => expect(h.api.markAllRead).toHaveBeenCalled());
  });

  it('mesaj gönderme başarısız (429) → toast.error + dialog AÇIK kalır', async () => {
    h.api.sendMessage.mockRejectedValue({ response: { status: 429, data: { message: 'Too many' } } });
    renderWithProviders(<SchoolNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: /mesaj gönder/i }));
    // Dialog açıldı — başlık input'u + sınıf seçimi
    const dialog = await screen.findByRole('dialog');
    const titleInput = dialog.querySelector('#nt');
    fireEvent.change(titleInput, { target: { value: 'Tatil nasıl?' } });
    // Hedef sınıf checkbox'ını seç
    const checkbox = await within(dialog).findByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.submit(within(dialog).getByRole('button', { name: /gönder/i }).closest('form'));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Dialog HÂLÂ açık (kapanmadı)
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('mesaj gönderme başarılı → toast.success + dialog kapanır', async () => {
    renderWithProviders(<SchoolNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: /mesaj gönder/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(dialog.querySelector('#nt'), { target: { value: 'Selam' } });
    fireEvent.click(await within(dialog).findByRole('checkbox'));
    fireEvent.submit(within(dialog).getByRole('button', { name: /gönder/i }).closest('form'));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('başlık boşken gönder → sendMessage çağrılmaz (toast.error)', async () => {
    renderWithProviders(<SchoolNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: /mesaj gönder/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.submit(within(dialog).getByRole('button', { name: /gönder/i }).closest('form'));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(h.api.sendMessage).not.toHaveBeenCalled();
  });
});
