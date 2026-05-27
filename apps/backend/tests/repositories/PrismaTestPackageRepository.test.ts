/**
 * PrismaTestPackageRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    testPackage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    examTest: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    examQuestion: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { PrismaTestPackageRepository } from '../../src/infrastructure/repositories/PrismaTestPackageRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makePackageRow = (overrides: Partial<any> = {}) => ({
  id: 'pkg-1',
  tenantId: 'tenant-1',
  educatorId: 'edu-1',
  title: 'Test Package',
  description: 'Description',
  coverImageUrl: null,
  priceCents: 4900,
  difficulty: 'medium',
  isActive: false,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaTestPackageRepository', () => {
  let repo: PrismaTestPackageRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaTestPackageRepository();
  });

  // --- create ---

  describe('create', () => {
    it('paket oluşturur ve domain kaydını döner', async () => {
      // Arrange
      mock.testPackage.create.mockResolvedValueOnce(makePackageRow());

      // Act
      const result = await repo.create({
        tenantId: 'tenant-1',
        educatorId: 'edu-1',
        title: 'Test Package',
        priceCents: 4900,
      });

      // Assert
      expect(result.id).toBe('pkg-1');
      expect(result.priceCents).toBe(4900);
      expect(mock.testPackage.create).toHaveBeenCalledTimes(1);
    });
  });

  // --- findById ---

  describe('findById', () => {
    it('paket bulunduğunda domain kaydını döner', async () => {
      mock.testPackage.findUnique.mockResolvedValueOnce(makePackageRow());
      const result = await repo.findById('pkg-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('pkg-1');
    });

    it('paket bulunamazsa null döner', async () => {
      mock.testPackage.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- findByIdWithTests ---

  describe('findByIdWithTests', () => {
    it('paket ve testlerle birlikte döner', async () => {
      // Arrange
      mock.testPackage.findUnique.mockResolvedValueOnce({
        ...makePackageRow(),
        tests: [
          {
            id: 'test-1',
            title: 'Test 1',
            examTypeId: null,
            examType: null,
            isTimed: false,
            duration: null,
            durationSec: null,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            questions: [],
          },
        ],
      });

      // Act
      const result = await repo.findByIdWithTests('pkg-1');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.tests).toHaveLength(1);
    });
  });

  // --- update ---

  describe('update', () => {
    it('tanımlanan alanları günceller', async () => {
      // Arrange
      mock.testPackage.update.mockResolvedValueOnce(makePackageRow({ title: 'New Title' }));

      // Act
      const result = await repo.update('pkg-1', { title: 'New Title' });

      // Assert
      expect(result.title).toBe('New Title');
      expect(mock.testPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pkg-1' },
          data: expect.objectContaining({ title: 'New Title' }),
        }),
      );
    });
  });

  // --- publish ---

  describe('publish', () => {
    it('paket ve testleri yayınlar', async () => {
      // Arrange
      mock.testPackage.findUnique
        .mockResolvedValueOnce(makePackageRow({ priceCents: 4900 }))
        .mockResolvedValueOnce(makePackageRow({ publishedAt: new Date(), isActive: true }));
      mock.examTest.findMany.mockResolvedValueOnce([{ id: 'test-1' }]);
      mock.examQuestion.count.mockResolvedValueOnce(10);
      mock.examTest.update.mockResolvedValueOnce({});
      mock.testPackage.update.mockResolvedValueOnce({});

      // Act
      const result = await repo.publish('pkg-1');

      // Assert
      expect(result.isActive).toBe(true);
      expect(mock.testPackage.update).toHaveBeenCalled();
    });
  });

  // --- unpublish ---

  describe('unpublish', () => {
    it('paket ve testleri yayından kaldırır', async () => {
      // Arrange
      mock.$transaction.mockImplementationOnce(async (ops: any[]) => {
        return Promise.all(ops.map((op) => (typeof op === 'function' ? op() : Promise.resolve(op))));
      });
      mock.testPackage.findUnique.mockResolvedValueOnce(makePackageRow());

      // Act
      const result = await repo.unpublish('pkg-1');

      // Assert
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
