// @ts-nocheck
import { SendWeeklyFollowDigestUseCase } from '../../src/application/use-cases/notification/SendWeeklyFollowDigestUseCase';

// prisma modülünü mock'la — test gerçek DB'ye bağlanmasın
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findMany: jest.fn().mockResolvedValue([
        { id: 't1', title: 'Test 1', educatorId: 'e1', examTypeId: 'et1' },
      ]),
    },
  },
}));

test('weekly digest enqueues emails', async () => {
  const followRepo = {
    listFollowersForEducator: jest.fn().mockResolvedValue(['u1']),
    listFollowersForExamType: jest.fn().mockResolvedValue([]),
  };
  const prefRepo = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'np1', userId: 'u1', emailEnabled: true, unsubscribeToken: 't' }),
  };
  const queueService = { enqueueEmail: jest.fn().mockResolvedValue(true) };
  const auditRepo = { create: jest.fn().mockResolvedValue(true) };

  const uc = new SendWeeklyFollowDigestUseCase(followRepo as any, prefRepo as any, queueService as any, auditRepo as any);
  const res = await uc.execute();
  expect(res).toHaveProperty('enqueued');
  expect(queueService.enqueueEmail).toHaveBeenCalled();
});
