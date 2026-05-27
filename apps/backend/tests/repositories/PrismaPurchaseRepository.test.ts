/**
 * PrismaPurchaseRepository unit testleri.
 * Prisma singleton jest.mock ile tamamen izole edilir — gerçek DB'ye değmez.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    purchase: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    examTest: {
      findUnique: jest.fn(),
    },
    testAttempt: {
      findMany: jest.fn(),
    },
  },
}));

import { PrismaPurchaseRepository } from '../../src/infrastructure/repositories/PrismaPurchaseRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('PrismaPurchaseRepository', () => {
  let repo: PrismaPurchaseRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaPurchaseRepository();
  });

  // --- hasPurchase ---

  describe('hasPurchase', () => {
    it('doğrudan testId üzerinden purchase varsa true döner', async () => {
      // Arrange
      mockPrisma.purchase.count.mockResolvedValueOnce(1);

      // Act
      const result = await repo.hasPurchase('test-1', 'candidate-1');

      // Assert
      expect(result).toBe(true);
      expect(mockPrisma.purchase.count).toHaveBeenCalledWith({
        where: { testId: 'test-1', candidateId: 'candidate-1' },
      });
    });

    it('doğrudan purchase yoksa paket purchase kontrol eder ve bulursa true döner', async () => {
      // Arrange
      mockPrisma.purchase.count
        .mockResolvedValueOnce(0)  // direkt check
        .mockResolvedValueOnce(1); // paket check
      mockPrisma.examTest.findUnique.mockResolvedValueOnce({ packageId: 'pkg-1' });

      // Act
      const result = await repo.hasPurchase('test-1', 'candidate-1');

      // Assert
      expect(result).toBe(true);
    });

    it('ne doğrudan ne de paket purchase yoksa false döner', async () => {
      // Arrange
      mockPrisma.purchase.count.mockResolvedValue(0);
      mockPrisma.examTest.findUnique.mockResolvedValueOnce({ packageId: 'pkg-1' });

      // Act
      const result = await repo.hasPurchase('test-1', 'candidate-1');

      // Assert
      expect(result).toBe(false);
    });

    it('testin packageId\'si null ise paket kontrolü yapılmadan false döner', async () => {
      // Arrange
      mockPrisma.purchase.count.mockResolvedValueOnce(0);
      mockPrisma.examTest.findUnique.mockResolvedValueOnce({ packageId: null });

      // Act
      const result = await repo.hasPurchase('test-1', 'candidate-1');

      // Assert
      expect(result).toBe(false);
      expect(mockPrisma.purchase.count).toHaveBeenCalledTimes(1);
    });
  });

  // --- findById ---

  describe('findById', () => {
    it('purchase bulunduğunda domain nesnesini döner', async () => {
      // Arrange
      const now = new Date();
      mockPrisma.purchase.findUnique.mockResolvedValueOnce({
        id: 'pur-1',
        testId: 'test-1',
        candidateId: 'cand-1',
        createdAt: now,
      });

      // Act
      const result = await repo.findById('pur-1');

      // Assert
      expect(result).toEqual({
        id: 'pur-1',
        testId: 'test-1',
        candidateId: 'cand-1',
        createdAt: now,
      });
    });

    it('purchase bulunamadığında null döner', async () => {
      // Arrange
      mockPrisma.purchase.findUnique.mockResolvedValueOnce(null);

      // Act
      const result = await repo.findById('nonexistent');

      // Assert
      expect(result).toBeNull();
    });
  });

  // --- findByCandidateId ---

  describe('findByCandidateId', () => {
    it('aday purchase\'ları varsa listeler ve attempt\'ı zenginleştirir', async () => {
      // Arrange
      const now = new Date();
      mockPrisma.purchase.findMany.mockResolvedValueOnce([
        {
          id: 'pur-1',
          testId: 'test-1',
          packageId: null,
          candidateId: 'cand-1',
          createdAt: now,
          amountCents: 4900,
          status: 'PAID',
          test: { id: 'test-1', title: 'Test', status: 'PUBLISHED', examTypeId: 'et-1', _count: { questions: 5 } },
          package: null,
        },
      ]);
      mockPrisma.testAttempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          testId: 'test-1',
          status: 'SUBMITTED',
          startedAt: now,
          completedAt: now,
          submittedAt: now,
          score: 80,
          overtimeSeconds: null,
          metadata: null,
          answers: [
            { isCorrect: true, selectedOptionId: 'opt-1' },
            { isCorrect: false, selectedOptionId: 'opt-2' },
            { isCorrect: null, selectedOptionId: null },
          ],
        },
      ]);

      // Act
      const result = await repo.findByCandidateId('cand-1');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].attempt).toMatchObject({
        id: 'att-1',
        correctCount: 1,
        wrongCount: 1,
        emptyCount: 1,
      });
    });

    it('purchase yoksa boş dizi döner', async () => {
      // Arrange
      mockPrisma.purchase.findMany.mockResolvedValueOnce([]);
      mockPrisma.testAttempt.findMany.mockResolvedValueOnce([]);

      // Act
      const result = await repo.findByCandidateId('cand-1');

      // Assert
      expect(result).toEqual([]);
    });
  });
});
