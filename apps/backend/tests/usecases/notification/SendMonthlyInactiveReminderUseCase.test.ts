/**
 * SendMonthlyInactiveReminderUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Pasif kullanıcı yoksa enqueued=0 döner
 * - E-posta tercihi kapalı kullanıcılar atlanır
 * - Birden fazla attempt'i olan kullanıcıya tek e-posta gönderilir
 * - Başarı: enqueueEmail çağrılır, audit log yazılır
 */

process.env.REDIS_DISABLED = '1';

import { SendMonthlyInactiveReminderUseCase } from '../../../src/application/use-cases/notification/SendMonthlyInactiveReminderUseCase';

function makeUserRepo(rows: any[] = []) {
  return { listInactiveUsersWithOpenAttempts: jest.fn().mockResolvedValue(rows) };
}

function makePrefRepo(prefs: Record<string, any> = {}) {
  return {
    findByUserId: jest.fn().mockImplementation(async (userId: string) => prefs[userId] ?? null),
  };
}

function makeQueueService() {
  return { enqueueEmail: jest.fn().mockResolvedValue(undefined) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('SendMonthlyInactiveReminderUseCase', () => {
  it('pasif kullanıcı yoksa enqueued=0 döner', async () => {
    const uc = new SendMonthlyInactiveReminderUseCase(makeUserRepo([]) as any, makePrefRepo() as any, makeQueueService() as any, makeAuditRepo() as any);
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('e-posta tercihi kapalı kullanıcılar atlanır', async () => {
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([{ userId: 'u1', attemptId: 'att-1' }]) as any,
      makePrefRepo({ u1: { emailEnabled: false } }) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('e-posta tercihi açık kullanıcıya e-posta gönderilir', async () => {
    const queue = makeQueueService();
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([{ userId: 'u1', attemptId: 'att-1' }]) as any,
      makePrefRepo({ u1: { emailEnabled: true } }) as any,
      queue as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(1);
    expect(queue.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it('aynı kullanıcının birden fazla attempt i varsa tek e-posta gönderilir', async () => {
    const queue = makeQueueService();
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([
        { userId: 'u1', attemptId: 'att-1' },
        { userId: 'u1', attemptId: 'att-2' },
      ]) as any,
      makePrefRepo({ u1: { emailEnabled: true } }) as any,
      queue as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(1);
    expect(queue.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it('audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([]) as any,
      makePrefRepo() as any,
      makeQueueService() as any,
      auditRepo as any,
    );
    await uc.execute();
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMAIL_SENT' }),
    );
  });

  it('prefRepo kaydı bulunamazsa kullanıcı atlanır', async () => {
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([{ userId: 'u-no-pref', attemptId: 'att-1' }]) as any,
      makePrefRepo({}) as any, // no prefs for this user
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });
});
