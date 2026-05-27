/**
 * PrismaReviewRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    review: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

import { PrismaReviewRepository } from '../../src/infrastructure/repositories/PrismaReviewRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeReviewRow = (overrides: Partial<any> = {}) => ({
  id: 'rev-1',
  packageId: 'pkg-1',
  testId: null,
  educatorId: 'edu-1',
  candidateId: 'cand-1',
  testRating: 4,
  educatorRating: 5,
  comment: 'Great test',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaReviewRepository', () => {
  let repo: PrismaReviewRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaReviewRepository();
  });

  // --- upsertPackageReview ---

  describe('upsertPackageReview', () => {
    it('mevcut review yoksa yeni review oluşturur', async () => {
      // Arrange
      mock.review.findFirst.mockResolvedValueOnce(null);
      mock.review.create.mockResolvedValueOnce(makeReviewRow());

      // Act
      const result = await repo.upsertPackageReview({
        packageId: 'pkg-1',
        educatorId: 'edu-1',
        candidateId: 'cand-1',
        testRating: 4,
      });

      // Assert
      expect(result.id).toBe('rev-1');
      expect(mock.review.create).toHaveBeenCalledTimes(1);
      expect(mock.review.update).not.toHaveBeenCalled();
    });

    it('mevcut review varsa günceller', async () => {
      // Arrange
      const existing = makeReviewRow({ testRating: 3 });
      mock.review.findFirst.mockResolvedValueOnce(existing);
      mock.review.update.mockResolvedValueOnce(makeReviewRow({ testRating: 4 }));

      // Act
      const result = await repo.upsertPackageReview({
        packageId: 'pkg-1',
        educatorId: 'edu-1',
        candidateId: 'cand-1',
        testRating: 4,
      });

      // Assert
      expect(mock.review.update).toHaveBeenCalledTimes(1);
      expect(result.testRating).toBe(4);
    });
  });

  // --- listReviewsForPackage ---

  describe('listReviewsForPackage', () => {
    it('paket için yorumları cursor ile listeler', async () => {
      // Arrange
      mock.review.findMany.mockResolvedValueOnce([makeReviewRow(), makeReviewRow({ id: 'rev-2' })]);

      // Act
      const result = await repo.listReviewsForPackage('pkg-1', 2);

      // Assert
      expect(result.items).toHaveLength(2);
    });

    it('limit 50\'den büyük geçilirse 50\'ye sınırlandırılır', async () => {
      mock.review.findMany.mockResolvedValueOnce([]);
      await repo.listReviewsForPackage('pkg-1', 200);
      expect(mock.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('cursor geçildiğinde skip:1 uygulanır', async () => {
      mock.review.findMany.mockResolvedValueOnce([]);
      await repo.listReviewsForPackage('pkg-1', 10, 'rev-cursor-1');
      expect(mock.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'rev-cursor-1' },
          skip: 1,
        }),
      );
    });
  });

  // --- getAggregateForPackage ---

  describe('getAggregateForPackage', () => {
    it('paket için ortalama ve sayı döner', async () => {
      // Arrange
      mock.review.aggregate.mockResolvedValueOnce({
        _avg: { testRating: 4.2 },
        _count: { _all: 10 },
      });

      // Act
      const result = await repo.getAggregateForPackage('pkg-1');

      // Assert
      expect(result.avg).toBe(4.2);
      expect(result.count).toBe(10);
    });

    it('review yoksa avg null ve count 0 döner', async () => {
      mock.review.aggregate.mockResolvedValueOnce({
        _avg: { testRating: null },
        _count: { _all: 0 },
      });
      const result = await repo.getAggregateForPackage('empty-pkg');
      expect(result.avg).toBeNull();
      expect(result.count).toBe(0);
    });
  });

  // --- getAggregateForEducator ---

  describe('getAggregateForEducator', () => {
    it('eğitici için ortalama eğitici puanı ve sayı döner', async () => {
      mock.review.aggregate.mockResolvedValueOnce({
        _avg: { educatorRating: 4.8 },
        _count: { _all: 5 },
      });
      const result = await repo.getAggregateForEducator('edu-1');
      expect(result.avg).toBe(4.8);
      expect(result.count).toBe(5);
    });
  });
});
