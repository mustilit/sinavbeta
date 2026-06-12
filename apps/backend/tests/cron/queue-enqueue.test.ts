import { SendWeeklyFollowDigestUseCase } from '../../src/application/use-cases/notification/SendWeeklyFollowDigestUseCase';

// prisma modülünü mock'la — test gerçek DB'ye bağlanmasın
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findMany: jest.fn().mockResolvedValue([
        { id: 't1', title: 'Test 1', educatorId: 'e1', examTypeId: 'et1' },
      ]),
    },
    user: {
      // educatorIds name lookup: [{ id: 'e1', username: 'educator1' }]
      // recipientUsers lookup: [{ id: 'u1', email: 'u1@test.com', username: 'u1', tenantId: 'ten1', role: 'CANDIDATE' }]
      findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'e1', username: 'educator1' }])
        .mockResolvedValue([{ id: 'u1', email: 'u1@test.com', username: 'u1', tenantId: 'ten1', role: 'CANDIDATE' }]),
    },
  },
}));

jest.mock('../../src/application/services/email/EmailService', () => ({
  getEmailService: () => ({ send: jest.fn().mockResolvedValue(undefined) }),
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
  // UC şu an emailService.send üzerinden gönderiyor (queueService.enqueueEmail artık çağrılmıyor)
  expect(res.enqueued).toBeGreaterThan(0);
});
