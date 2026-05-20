// @ts-nocheck
import { PublishTestUseCase } from '../../src/application/use-cases/test/PublishTestUseCase';

// PublishTestUseCase prisma singleton'ını adminSettings için kullanıyor; mock gerekli
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, testPublishingEnabled: true }),
    },
  },
}));

// QueueService: stats refresh kuyruğu test akışını engellemez
jest.mock('../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({
    enqueueJob: jest.fn().mockResolvedValue(undefined),
  })),
}));

// PrismaFollowRepository ve RedisCache constructor'da yaratılıyor; mock'la
jest.mock('../../src/infrastructure/repositories/PrismaFollowRepository', () => ({
  PrismaFollowRepository: jest.fn().mockImplementation(() => ({
    listFollowersForEducator: jest.fn().mockResolvedValue([]),
    listFollowersForExamType: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    delByPrefix: jest.fn().mockResolvedValue(1),
  })),
}));

test('publish invalidates follower caches', async () => {
  // Arrange: 5 sorulu (min=5), her soru 2 seçenekli, biri doğru, examTypeId geçerli
  const makeQuestion = (id: string) => ({
    id,
    options: [{ id: `${id}-o1`, isCorrect: true }, { id: `${id}-o2`, isCorrect: false }],
    solutionText: null,
    solutionMediaUrl: null,
  });
  const exam = {
    id: 't1',
    title: 'T',
    educatorId: 'e1',
    examTypeId: '11111111-1111-4111-a111-111111111111',
    isTimed: false,
    duration: null,
    hasSolutions: false,
    questions: ['q1', 'q2', 'q3', 'q4', 'q5'].map(makeQuestion),
  };
  const examRepo: any = { findById: async () => exam, publish: async () => exam };
  const auditRepo: any = { create: jest.fn() };
  const approvedEducator = { id: 'e1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date() };
  const userRepo: any = { findById: async (id: string) => (id === 'e1' ? approvedEducator : null) };
  const followRepo: any = {
    listFollowersForEducator: jest.fn().mockResolvedValue(['c1', 'c2']),
    listFollowersForExamType: jest.fn().mockResolvedValue(['c2', 'c3']),
  };
  const cache = { delByPrefix: jest.fn().mockResolvedValue(1) };
  const uc = new PublishTestUseCase(examRepo, auditRepo, userRepo, followRepo, cache);
  // Act
  const res = await uc.execute('t1', 'e1');
  // Assert
  expect(res).toBeDefined();
  expect(cache.delByPrefix).toHaveBeenCalled();
  const calledKeys = cache.delByPrefix.mock.calls.map((c: any) => c[0]);
  expect(calledKeys).toEqual(expect.arrayContaining([
    expect.stringContaining('home:rec:c1:'),
    expect.stringContaining('home:rec:c2:'),
    expect.stringContaining('home:rec:c3:'),
  ]));
});

