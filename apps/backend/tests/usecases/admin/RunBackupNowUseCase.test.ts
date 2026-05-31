/**
 * RunBackupNowUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Başarılı yedeklemede logId döner
 * - Scheduler başarısız dönünce BACKUP_FAILED fırlatır
 * - error mesajı ile BACKUP_FAILED 500 status taşır
 */

// BackupSchedulerService yalnızca tip olarak kullanılır (constructor parametre tipi).
// Gerçek modülü import etmek prisma singleton'ını + BackupService'i yükler; bu da
// birim testini DB altyapısına bağlar. Stub'layarak testi izole tutuyoruz.
jest.mock('../../../src/nest/services/BackupSchedulerService', () => ({
  BackupSchedulerService: class {},
}));

import { RunBackupNowUseCase } from '../../../src/application/use-cases/admin/RunBackupNowUseCase';

function makeScheduler(result: { success: boolean; logId?: string; error?: string }) {
  return { runNow: jest.fn().mockResolvedValue(result) };
}

describe('RunBackupNowUseCase', () => {
  it('başarılı yedeklemede logId döner', async () => {
    const scheduler = makeScheduler({ success: true, logId: 'log-1' });
    const uc = new RunBackupNowUseCase(scheduler as any);
    const result = await uc.execute('admin-1');
    expect(result.logId).toBe('log-1');
    expect(scheduler.runNow).toHaveBeenCalledWith('admin-1');
  });

  it('scheduler başarısız dönünce BACKUP_FAILED fırlatır', async () => {
    const scheduler = makeScheduler({ success: false, error: 'pg_dump exit 1' });
    const uc = new RunBackupNowUseCase(scheduler as any);
    await expect(uc.execute('admin-2')).rejects.toMatchObject({
      code: 'BACKUP_FAILED',
      status: 500,
    });
  });

  it('scheduler success:false ve error undefined olduğunda fallback mesaj kullanılır', async () => {
    const scheduler = makeScheduler({ success: false });
    const uc = new RunBackupNowUseCase(scheduler as any);
    await expect(uc.execute('admin-3')).rejects.toMatchObject({
      message: 'Yedekleme başarısız',
    });
  });

  it('actorId scheduler.runNow\'a iletilir', async () => {
    const scheduler = makeScheduler({ success: true, logId: 'log-2' });
    const uc = new RunBackupNowUseCase(scheduler as any);
    await uc.execute('actor-xyz');
    expect(scheduler.runNow).toHaveBeenCalledWith('actor-xyz');
  });
});
