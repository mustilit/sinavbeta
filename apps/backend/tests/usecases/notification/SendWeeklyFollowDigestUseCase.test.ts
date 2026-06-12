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
    user: {
      // UC, user.findMany'yi iki kez çağırır:
      //   1) educatorIds → educator adı çözme
      //   2) recipients  → e-posta + tenantId
      // Her testte mockResolvedValueOnce zinciri kurulur (beforeEach clearAllMocks sonra).
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/application/services/email/EmailService', () => ({
  getEmailService: () => ({ send: jest.fn().mockResolvedValue(undefined) }),
}));

import { SendWeeklyFollowDigestUseCase } from '../../../src/application/use-cases/notification/SendWeeklyFollowDigestUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockFindMany = prisma.examTest.findMany as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;

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

/**
 * UC'nin user.findMany'sini iki çağrı için hazırlar:
 *   1) educatorIds lookup → [{id, username}]
 *   2) recipientUsers lookup → her userId için {id, email, username, tenantId, role}
 */
function setupUserFindMany(educatorId: string, userIds: string[]) {
  mockUserFindMany
    .mockResolvedValueOnce([{ id: educatorId, username: 'educator1' }])
    .mockResolvedValueOnce(
      userIds.map((uid) => ({
        id: uid,
        email: `${uid}@test.com`,
        username: uid,
        tenantId: 'ten1',
        role: 'CANDIDATE',
      })),
    );
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
    // Takipçi yok → recipients boş → user.findMany 2. çağrısı gerçekleşmeyebilir
    mockUserFindMany.mockResolvedValue([]);
    const followRepo = makeFollowRepo([]); // takipçi yok
    const uc = new SendWeeklyFollowDigestUseCase(
      followRepo as any,
      makePrefRepo(true) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('e-posta tercihi kapalı kullanıcı atlanır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    setupUserFindMany('edu-1', ['user-1']);
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo(['user-1']) as any,
      makePrefRepo(false) as any, // kapalı
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(0);
  });

  it('başarılı gönderimde audit log yazılır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    setupUserFindMany('edu-1', ['user-1']);
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
    setupUserFindMany('edu-1', ['user-1']);
    const followRepo = {
      listFollowersForEducator: jest.fn().mockResolvedValue(['user-1']),
      listFollowersForExamType: jest.fn().mockResolvedValue(['user-1']), // aynı kullanıcı
    };
    const uc = new SendWeeklyFollowDigestUseCase(
      followRepo as any,
      makePrefRepo(true) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(1);
  });

  it('birden fazla farklı kullanıcıya gönderim yapılır', async () => {
    mockFindMany.mockResolvedValue([{ id: 't1', title: 'T1', educatorId: 'edu-1', examTypeId: null }]);
    setupUserFindMany('edu-1', ['user-1', 'user-2', 'user-3']);
    const uc = new SendWeeklyFollowDigestUseCase(
      makeFollowRepo(['user-1', 'user-2', 'user-3']) as any,
      makePrefRepo(true) as any,
      makeQueueService() as any,
      makeAuditRepo() as any,
    );
    const result = await uc.execute();
    expect(result.enqueued).toBe(3);
  });
});
