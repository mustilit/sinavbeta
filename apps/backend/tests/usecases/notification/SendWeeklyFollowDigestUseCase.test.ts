/**
 * SendWeeklyFollowDigestUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Son 7 günde yeni test yoksa enqueued = 0 döner
 * - Takipçi olmayan eğiticinin testleri kimseye gönderilmez
 * - E-posta tercihi kapalı kullanıcı atlanır
 * - Aynı kullanıcı birden fazla kaynaktan tetiklenirse bir kez gönderilir
 * - Başarıda audit log yazılır
 * - enqueued sayısı doğru hesaplanır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findMany: jest.fn(),
    },
  },
}));

import { SendWeeklyFollowDigestUseCase } from '../../../src/application/use-cases/notification/SendWeeklyFollowDigestUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockFindMany = prisma.examTest.findMany as jest.Mock;

function makeFollowRepo(educatorFollowers: string[] = [], examTypeFollowers: string[] = []) {
  return {
    listFollowersForEducator: jest.fn().mockResolvedValue(educatorFollowers),
    listFollowersForExamType: jest.fn().mockResolvedValue(examTypeFollowers),
  };
}

function makePrefRepo(emailEnabled: boolean) {
  return {
    findByUserId: jest.fn().mockResolvedValue({ emailEnabled }),
  };
}

function makeQueueService() {
  return { enqueueEmail: jest.fn().mockResolvedValue(undefined) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue(undefined) };
}

describe('SendWeeklyFollowDigestUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('son 7 günde yayınlanan test yoksa enqueued = 0 döner', async () => {
    mockFindMany.mockResolvedValue([]);
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo() as any,
      makePrefRepo(true) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('takipçi olmayan eğitici için sıfır e-posta gönderilir', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    const followRepo = makeFollowRepo([]); // takipçi yok
    const queueService = makeQueueService();
    const uc = new SendWeeklyFollowDigestUseCase(
      followRepo as any,
      makePrefRepo(true) as any,
      queueService as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
    expect(queueService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('e-posta tercihi kapalı kullanıcı atlanır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    const queueService = makeQueueService();
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo(['user-1']) as any,
      makePrefRepo(false) as any, // kapalı
      queueService as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
    expect(queueService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('başarılı gönderimde audit log yazılır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    const auditRepo = makeAuditRepo();
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo(['user-1']) as any,
      makePrefRepo(true) as any,
      makeQueueService() as any,
      auditRepo as any,
    );
    await uc.execute();
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMAIL_SENT', entityType: 'Digest' }),
    );
  });

  it('aynı kullanıcı iki kaynaktan tetiklenirse bir kez kuyruğa girer', async () => {
    mockFindMany.mockResolvedValue([
      { id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: 'et-1' },
    ]);
    const followRepo = {
      listFollowersForEducator: jest.fn().mockResolvedValue(['user-1']),
      listFollowersForExamType: jest.fn().mockResolvedValue(['user-1']), // aynı kullanıcı
    };
    const queueService = makeQueueService();
    const uc = new SendWeeklyFollowDigestUseCase(
      followRepo as any,
      makePrefRepo(true) as any,
      queueService as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(1);
    expect(queueService.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it('birden fazla farklı kullanıcıya gönderim yapılır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    const queueService = makeQueueService();
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo(['user-1', 'user-2', 'user-3']) as any,
      makePrefRepo(true) as any,
      queueService as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(3);
    expect(queueService.enqueueEmail).toHaveBeenCalledTimes(3);
  });
});
