/**
 * PrismaFollowRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    follow: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { PrismaFollowRepository } from '../../src/infrastructure/repositories/PrismaFollowRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

describe('PrismaFollowRepository', () => {
  let repo: PrismaFollowRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaFollowRepository();
  });

  // --- listFollowersForEducator ---

  describe('listFollowersForEducator', () => {
    it('bildirimleri açık takipçi id\'lerini döner', async () => {
      mock.follow.findMany.mockResolvedValueOnce([
        { followerId: 'cand-1' },
        { followerId: 'cand-2' },
      ]);
      const result = await repo.listFollowersForEducator('edu-1');
      expect(result).toEqual(['cand-1', 'cand-2']);
    });

    it('takipçi yoksa boş dizi döner', async () => {
      mock.follow.findMany.mockResolvedValueOnce([]);
      const result = await repo.listFollowersForEducator('edu-1');
      expect(result).toEqual([]);
    });
  });

  // --- listFollowedEducatorIds ---

  describe('listFollowedEducatorIds', () => {
    it('kullanıcının takip ettiği eğitici id\'lerini döner', async () => {
      mock.follow.findMany.mockResolvedValueOnce([
        { educatorId: 'edu-1' },
        { educatorId: 'edu-2' },
      ]);
      const result = await repo.listFollowedEducatorIds('cand-1');
      expect(result).toEqual(['edu-1', 'edu-2']);
    });
  });

  // --- upsertFollow ---

  describe('upsertFollow', () => {
    it('EDUCATOR tipi ile upsert yapar', async () => {
      mock.follow.upsert.mockResolvedValueOnce({});
      await repo.upsertFollow({
        followerId: 'cand-1',
        followType: 'EDUCATOR',
        educatorId: 'edu-1',
        notificationsEnabled: true,
      });
      expect(mock.follow.upsert).toHaveBeenCalledTimes(1);
    });

    it('EXAM_TYPE tipi ile upsert yapar', async () => {
      mock.follow.upsert.mockResolvedValueOnce({});
      await repo.upsertFollow({
        followerId: 'cand-1',
        followType: 'EXAM_TYPE',
        examTypeId: 'et-1',
      });
      expect(mock.follow.upsert).toHaveBeenCalledTimes(1);
    });

    it('geçersiz input hatası fırlatır', async () => {
      await expect(
        repo.upsertFollow({ followerId: 'cand-1', followType: 'EDUCATOR' }),
      ).rejects.toThrow('Invalid upsertFollow input');
    });
  });

  // --- deleteFollow ---

  describe('deleteFollow', () => {
    it('EDUCATOR takibini siler', async () => {
      mock.follow.deleteMany.mockResolvedValueOnce({ count: 1 });
      await repo.deleteFollow({ followerId: 'cand-1', followType: 'EDUCATOR', educatorId: 'edu-1' });
      expect(mock.follow.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
