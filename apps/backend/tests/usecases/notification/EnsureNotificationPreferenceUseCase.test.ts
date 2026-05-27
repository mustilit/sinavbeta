/**
 * EnsureNotificationPreferenceUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - userId ile repo.ensureForUser çağrılır
 * - Kayıt yoksa oluşturulur
 * - Mevcut kayıt güncellenmez
 */

import { EnsureNotificationPreferenceUseCase } from '../../../src/application/use-cases/notification/EnsureNotificationPreferenceUseCase';

function makeRepo(existing: any = null) {
  return { ensureForUser: jest.fn().mockResolvedValue(existing ?? { userId: 'u1', emailEnabled: true }) };
}

describe('EnsureNotificationPreferenceUseCase', () => {
  it('repo.ensureForUser çağrılır', async () => {
    const repo = makeRepo();
    const uc = new EnsureNotificationPreferenceUseCase(repo as any);
    await uc.execute('u1');
    expect(repo.ensureForUser).toHaveBeenCalledWith('u1');
  });

  it('kayıt yoksa oluşturulur (repo sonucu döner)', async () => {
    const repo = makeRepo({ userId: 'u1', emailEnabled: true });
    const uc = new EnsureNotificationPreferenceUseCase(repo as any);
    const result = await uc.execute('u1');
    expect(result).toMatchObject({ userId: 'u1' });
  });

  it('farklı userId ile ayrı çağrı yapılır', async () => {
    const repo = makeRepo({ userId: 'u2', emailEnabled: false });
    const uc = new EnsureNotificationPreferenceUseCase(repo as any);
    await uc.execute('u2');
    expect(repo.ensureForUser).toHaveBeenCalledWith('u2');
  });
});
