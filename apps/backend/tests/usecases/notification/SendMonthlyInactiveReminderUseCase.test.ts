/**
 * SendMonthlyInactiveReminderUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Pasif kullanıcı yoksa enqueued=0 döner
 * - E-posta tercihi kapalı kullanıcılar atlanır
 * - Birden fazla attempt'i olan kullanıcıya tek e-posta gönderilir
 * - Başarı: emailService.send çağrılır, audit log yazılır
 * - prefRepo kaydı bulunamazsa kullanıcı atlanır
 */

process.env.REDIS_DISABLED = '1';

// prisma modülünü mock'la — gerçek PrismaClient yüklenip engine aranmasın
// UC, user.findMany ile recipientUsers'ı tek sorguda çeker.
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/application/services/email/EmailService', () => ({
  getEmailService: () => ({ send: jest.fn().mockResolvedValue(undefined) }),
}));

import { SendMonthlyInactiveReminderUseCase } from '../../../src/application/use-cases/notification/SendMonthlyInactiveReminderUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockUserFindMany = prisma.user.findMany as jest.Mock;

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

/** Verilen userId listesine göre user.findMany mock'unu hazırlar */
function setupUsers(userIds: string[]) {
  mockUserFindMany.mockResolvedValue(
    userIds.map((uid) => ({
      id: uid,
      email: `${uid}@test.com`,
      username: uid,
      tenantId: 'ten1',
      role: 'CANDIDATE',
    })),
  );
}

describe('SendMonthlyInactiveReminderUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan: boş liste (her test kendi setupUsers çağrısını yapar)
    mockUserFindMany.mockResolvedValue([]);
  });

  it('pasif kullanıcı yoksa enqueued=0 döner', async () => {
    const uc = new SendMonthlyInactiveReminderUseCase(makeUserRepo([]) as any, makePrefRepo() as any, makeQueueService() as any, makeAuditRepo() as any);
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('e-posta tercihi kapalı kullanıcılar atlanır', async () => {
    setupUsers(['u1']);
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
    setupUsers(['u1']);
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([{ userId: 'u1', attemptId: 'att-1' }]) as any,
      makePrefRepo({ u1: { emailEnabled: true } }) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    // UC, emailService.send kullanır (queueService.enqueueEmail artık çağrılmıyor)
    expect(result.enqueued).toBe(1);
  });

  it('aynı kullanıcının birden fazla attempt i varsa tek e-posta gönderilir', async () => {
    setupUsers(['u1']);
    const uc = new SendMonthlyInactiveReminderUseCase(
      makeUserRepo([
        { userId: 'u1', attemptId: 'att-1' },
        { userId: 'u1', attemptId: 'att-2' },
      ]) as any,
      makePrefRepo({ u1: { emailEnabled: true } }) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(1);
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
    setupUsers(['u-no-pref']);
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
