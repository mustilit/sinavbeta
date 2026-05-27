/**
 * PrismaExamRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/common/tenant', () => ({
  getDefaultTenantId: () => 'default-tenant',
}));

import { PrismaExamRepository } from '../../src/infrastructure/repositories/PrismaExamRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeTestRow = (overrides: Partial<any> = {}) => ({
  id: 'test-1',
  tenantId: 'tenant-1',
  title: 'Test Title',
  isTimed: false,
  duration: null,
  status: 'DRAFT',
  educatorId: 'edu-1',
  examTypeId: null,
  topicId: null,
  metadata: {},
  publishedAt: null,
  priceCents: 4900,
  packageId: null,
  hasSolutions: false,
  questionCount: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  questions: [],
  ...overrides,
});

describe('PrismaExamRepository', () => {
  let repo: PrismaExamRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaExamRepository();
  });

  // --- findById ---

  describe('findById', () => {
    it('test bulunduğunda soruları ve seçenekleriyle döner', async () => {
      // Arrange
      mock.examTest.findUnique.mockResolvedValueOnce(
        makeTestRow({
          questions: [
            {
              id: 'q-1',
              content: 'Soru 1',
              order: 1,
              mediaUrl: null,
              solutionText: null,
              solutionMediaUrl: null,
              options: [
                { id: 'o-1', content: 'A', isCorrect: true, mediaUrl: null },
              ],
            },
          ],
        }),
      );

      // Act
      const result = await repo.findById('test-1');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.questions).toHaveLength(1);
      expect(result!.questions[0].options).toHaveLength(1);
    });

    it('test bulunamazsa null döner', async () => {
      mock.examTest.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- findAll ---

  describe('findAll', () => {
    it('tüm testleri listeler', async () => {
      // Arrange
      mock.examTest.findMany.mockResolvedValueOnce([makeTestRow(), makeTestRow({ id: 'test-2' })]);

      // Act
      const result = await repo.findAll();

      // Assert
      expect(result).toHaveLength(2);
    });
  });
});
