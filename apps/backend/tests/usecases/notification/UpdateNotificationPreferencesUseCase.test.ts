/**
 * UpdateNotificationPreferencesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - repo.updateByUserId çağrılır
 * - Kısmi güncelleme: sadece verilen alanlar geçirilir
 * - emailEnabled false geçilebilir
 * - Başarı: güncellenmiş tercih döner
 */

import { UpdateNotificationPreferencesUseCase } from '../../../src/application/use-cases/notification/UpdateNotificationPreferencesUseCase';

function makeRepo(result: any = null) {
  return {
    updateByUserId: jest.fn().mockResolvedValue(
      result ?? { userId: 'user-1', emailEnabled: true, weeklyDigestEnabled: false, inactiveReminderEnabled: true },
    ),
  };
}

describe('UpdateNotificationPreferencesUseCase', () => {
  it('repo.updateByUserId çağrılır', async () => {
    const repo = makeRepo();
    const uc = new UpdateNotificationPreferencesUseCase(repo as any);
    await uc.execute('user-1', { emailEnabled: false });
    expect(repo.updateByUserId).toHaveBeenCalledWith('user-1', { emailEnabled: false });
  });

  it('emailEnabled false geçilebilir', async () => {
    const repo = makeRepo({ userId: 'user-1', emailEnabled: false });
    const uc = new UpdateNotificationPreferencesUseCase(repo as any);
    const result = await uc.execute('user-1', { emailEnabled: false });
    expect((result as any).emailEnabled).toBe(false);
  });

  it('weeklyDigestEnabled güncellenebilir', async () => {
    const repo = makeRepo();
    const uc = new UpdateNotificationPreferencesUseCase(repo as any);
    await uc.execute('user-1', { weeklyDigestEnabled: true });
    expect(repo.updateByUserId).toHaveBeenCalledWith('user-1', { weeklyDigestEnabled: true });
  });

  it('kısmi güncelleme — sadece verilen alanlar geçirilir', async () => {
    const repo = makeRepo();
    const uc = new UpdateNotificationPreferencesUseCase(repo as any);
    await uc.execute('user-1', { inactiveReminderEnabled: false });
    const call = repo.updateByUserId.mock.calls[0];
    expect(call[1]).toEqual({ inactiveReminderEnabled: false });
    expect(Object.keys(call[1])).toHaveLength(1);
  });

  it('tüm alanlar birlikte güncellenebilir', async () => {
    const repo = makeRepo();
    const uc = new UpdateNotificationPreferencesUseCase(repo as any);
    await uc.execute('user-1', {
      emailEnabled: true,
      weeklyDigestEnabled: true,
      inactiveReminderEnabled: false,
    });
    expect(repo.updateByUserId).toHaveBeenCalledWith('user-1', {
      emailEnabled: true,
      weeklyDigestEnabled: true,
      inactiveReminderEnabled: false,
    });
  });
});
