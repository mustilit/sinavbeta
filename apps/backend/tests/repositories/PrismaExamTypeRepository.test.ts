/**
 * PrismaExamTypeRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examType: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    topic: {
      count: jest.fn(),
    },
  },
}));

import { PrismaExamTypeRepository } from '../../src/infrastructure/repositories/PrismaExamTypeRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeRow = (overrides: Partial<any> = {}) => ({
  id: 'et-1',
  name: 'ÖSYM',
  description: 'Merkezi sınavlar',
  slug: 'osym',
  active: true,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaExamTypeRepository', () => {
  let repo: PrismaExamTypeRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaExamTypeRepository();
  });

  describe('list', () => {
    it('tüm sınav türlerini listeler', async () => {
      mock.examType.findMany.mockResolvedValueOnce([makeRow(), makeRow({ id: 'et-2', name: 'LGS' })]);
      const result = await repo.list();
      expect(result).toHaveLength(2);
    });

    it('activeOnly=true filtresiyle sadece aktif türleri listeler', async () => {
      mock.examType.findMany.mockResolvedValueOnce([makeRow()]);
      await repo.list({ activeOnly: true });
      expect(mock.examType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
    });
  });

  describe('findById', () => {
    it('sınav türü bulunduğunda döner', async () => {
      mock.examType.findUnique.mockResolvedValueOnce(makeRow());
      const result = await repo.findById('et-1');
      expect(result).not.toBeNull();
      expect((result as any).name).toBe('ÖSYM');
    });

    it('bulunamazsa null döner', async () => {
      mock.examType.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('yeni sınav türü oluşturur', async () => {
      mock.examType.create.mockResolvedValueOnce(makeRow());
      const result = await repo.create({ name: 'ÖSYM', slug: 'osym' });
      expect((result as any).name).toBe('ÖSYM');
      expect(mock.examType.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('mevcut tür güncellenir', async () => {
      mock.examType.updateMany.mockResolvedValueOnce({ count: 1 });
      mock.examType.findUnique.mockResolvedValueOnce(makeRow({ name: 'YKS' }));
      const result = await repo.update('et-1', { name: 'YKS' });
      expect((result as any).name).toBe('YKS');
    });

    it('id bulunamazsa null döner', async () => {
      mock.examType.updateMany.mockResolvedValueOnce({ count: 0 });
      const result = await repo.update('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('bağlı topic yoksa siler ve true döner', async () => {
      mock.topic.count.mockResolvedValueOnce(0);
      mock.examType.deleteMany.mockResolvedValueOnce({ count: 1 });
      const result = await repo.delete('et-1');
      expect(result).toBe(true);
    });

    it('bağlı topic varsa silmez ve false döner', async () => {
      mock.topic.count.mockResolvedValueOnce(3);
      const result = await repo.delete('et-1');
      expect(result).toBe(false);
      expect(mock.examType.deleteMany).not.toHaveBeenCalled();
    });
  });
});
