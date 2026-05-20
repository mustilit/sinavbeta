// @ts-nocheck
import { CreateOrUpdateReviewUseCase } from '../../src/application/use-cases/review/CreateOrUpdateReviewUseCase';

// CreateOrUpdateReviewUseCase içinde prisma singleton'ı kullanılıyor; mock gerekli
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', educatorId: 'e1' }),
    },
  },
}));

// QueueService mock'u: kuyruk süreci testi engellemez
jest.mock('../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({
    enqueueJob: jest.fn().mockResolvedValue(undefined),
  })),
}));

test('cannot create review without purchase', async () => {
  // Arrange: satın alma yok
  const reviewRepo: any = { upsertReview: async () => null };
  const purchaseRepo: any = { hasPurchase: async () => false };
  const attemptRepo: any = { hasSubmittedAttempt: async () => true };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateOrUpdateReviewUseCase(reviewRepo, purchaseRepo, attemptRepo, auditRepo);
  // Act & Assert
  await expect(uc.execute('t1', 'c1', { testRating: 4 })).rejects.toThrow();
});

test('cannot create review without submitted attempt', async () => {
  // Arrange: satın alma var ama tamamlanmış deneme yok
  const reviewRepo: any = { upsertReview: async () => null };
  const purchaseRepo: any = { hasPurchase: async () => true };
  const attemptRepo: any = { hasSubmittedAttempt: async () => false };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateOrUpdateReviewUseCase(reviewRepo, purchaseRepo, attemptRepo, auditRepo);
  // Act & Assert
  await expect(uc.execute('t1', 'c1', { testRating: 5 })).rejects.toThrow();
});

test('upsert review works', async () => {
  // Arrange: geçerli satın alma + tamamlanmış deneme
  const created = { id: 'r1', testId: 't1', candidateId: 'c1', testRating: 5 };
  const reviewRepo: any = { upsertReview: async () => created };
  const purchaseRepo: any = { hasPurchase: async () => true };
  const attemptRepo: any = { hasSubmittedAttempt: async () => true };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateOrUpdateReviewUseCase(reviewRepo, purchaseRepo, attemptRepo, auditRepo);
  // Act
  const res = await uc.execute('t1', 'c1', { testRating: 5 });
  // Assert
  expect(res).toEqual(created);
});

