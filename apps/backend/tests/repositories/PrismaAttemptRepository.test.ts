/**
 * PrismaAttemptRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    testAttempt: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    attemptAnswer: {
      count: jest.fn(),
    },
  },
}));

import { PrismaAttemptRepository } from '../../src/infrastructure/repositories/PrismaAttemptRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

describe('PrismaAttemptRepository', () => {
  let repo: PrismaAttemptRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaAttemptRepository();
  });

  // --- countSubmittedByTest ---

  describe('countSubmittedByTest', () => {
    it('submit edilmiş deneme sayısını döner', async () => {
      // Arrange
      mock.testAttempt.count.mockResolvedValueOnce(7);

      // Act
      const result = await repo.countSubmittedByTest('test-1');

      // Assert
      expect(result).toBe(7);
    });
  });

  // --- findAttemptById ---

  describe('findAttemptById', () => {
    it('deneme bulunduğunda domain nesnesini döner', async () => {
      // Arrange
      const now = new Date();
      mock.testAttempt.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        candidateId: 'cand-1',
        testId: 'test-1',
        status: 'IN_PROGRESS',
        score: null,
        startedAt: now,
        completedAt: null,
        submittedAt: null,
        questionsSnapshot: null,
        metadata: null,
        overtimeSeconds: null,
        remainingSec: 1200,
        lastResumedAt: null,
      });

      // Act
      const result = await repo.findAttemptById('att-1');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe('att-1');
      expect(result!.status).toBe('IN_PROGRESS');
      expect((result as any).remainingSec).toBe(1200);
    });

    it('deneme bulunamadığında null döner', async () => {
      // Arrange
      mock.testAttempt.findUnique.mockResolvedValueOnce(null);

      // Act
      const result = await repo.findAttemptById('nonexistent');

      // Assert
      expect(result).toBeNull();
    });
  });

  // --- hasSubmittedAttempt ---

  describe('hasSubmittedAttempt', () => {
    it('submit edilmiş deneme varsa true döner', async () => {
      mock.testAttempt.count.mockResolvedValueOnce(1);
      const result = await repo.hasSubmittedAttempt('test-1', 'cand-1');
      expect(result).toBe(true);
    });

    it('submit edilmiş deneme yoksa false döner', async () => {
      mock.testAttempt.count.mockResolvedValueOnce(0);
      const result = await repo.hasSubmittedAttempt('test-1', 'cand-1');
      expect(result).toBe(false);
    });
  });

  // --- hasAnswersForQuestion ---

  describe('hasAnswersForQuestion', () => {
    it('soru için cevap varsa true döner', async () => {
      mock.attemptAnswer.count.mockResolvedValueOnce(2);
      const result = await repo.hasAnswersForQuestion('q-1');
      expect(result).toBe(true);
    });

    it('soru için cevap yoksa false döner', async () => {
      mock.attemptAnswer.count.mockResolvedValueOnce(0);
      const result = await repo.hasAnswersForQuestion('q-1');
      expect(result).toBe(false);
    });
  });

  // --- markTimeout ---

  describe('markTimeout', () => {
    it('timeout durumunu kaydeder ve domain nesnesini döner', async () => {
      // Arrange
      const now = new Date();
      mock.testAttempt.update.mockResolvedValueOnce({
        id: 'att-1',
        testId: 'test-1',
        candidateId: 'cand-1',
        startedAt: now,
        completedAt: now,
        status: 'TIMEOUT',
        score: 60,
        submittedAt: now,
      });

      // Act
      const result = await repo.markTimeout('att-1', {
        score: 60,
        submittedAt: now,
        completedAt: now,
      });

      // Assert
      expect(result.status).toBe('TIMEOUT');
      expect(result.score).toBe(60);
      expect(mock.testAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: expect.objectContaining({ status: 'TIMEOUT', score: 60 }),
      });
    });
  });

  // --- groupScoresByTest ---

  describe('groupScoresByTest', () => {
    it('skor gruplarını döner', async () => {
      mock.testAttempt.groupBy.mockResolvedValueOnce([
        { score: 80, _count: { score: 3 } },
        { score: 100, _count: { score: 1 } },
      ]);
      const result = await repo.groupScoresByTest('test-1');
      expect(result).toEqual([
        { score: 80, count: 3 },
        { score: 100, count: 1 },
      ]);
    });
  });
});
