/**
 * PrismaUserRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    testAttempt: {
      findMany: jest.fn(),
    },
    workerPermission: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/common/tenant', () => ({
  getDefaultTenantId: () => 'default-tenant',
}));

import { PrismaUserRepository } from '../../src/infrastructure/repositories/PrismaUserRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeUserRow = (overrides: Partial<any> = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: 'hash',
  role: 'CANDIDATE',
  status: 'ACTIVE',
  educatorApprovedAt: null,
  passwordResetToken: null,
  passwordResetTokenExpiresAt: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaUserRepository', () => {
  let repo: PrismaUserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaUserRepository();
  });

  // --- findByEmail ---

  describe('findByEmail', () => {
    it('email kayıtlıysa kullanıcıyı döner', async () => {
      mock.user.findUnique.mockResolvedValueOnce(makeUserRow());
      const result = await repo.findByEmail('test@example.com');
      expect(result).not.toBeNull();
      expect(result!.email).toBe('test@example.com');
    });

    it('email bulunamazsa null döner', async () => {
      mock.user.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findByEmail('unknown@example.com');
      expect(result).toBeNull();
    });

    it('emaili lowercase\'e normalize ederek sorgular', async () => {
      mock.user.findUnique.mockResolvedValueOnce(makeUserRow({ email: 'upper@example.com' }));
      await repo.findByEmail('UPPER@EXAMPLE.COM');
      expect(mock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'upper@example.com' },
      });
    });
  });

  // --- findById ---

  describe('findById', () => {
    it('kullanıcı bulunduğunda domain nesnesini döner', async () => {
      mock.user.findUnique.mockResolvedValueOnce(makeUserRow());
      const result = await repo.findById('user-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-1');
      expect(result!.role).toBe('CANDIDATE');
    });

    it('kullanıcı bulunamadığında null döner', async () => {
      mock.user.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- updateLastLoginAt ---

  describe('updateLastLoginAt', () => {
    it('lastLoginAt güncelleme sorgusunu çağırır', async () => {
      mock.user.update.mockResolvedValueOnce(makeUserRow());
      const date = new Date();
      await repo.updateLastLoginAt('user-1', date);
      expect(mock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ lastLoginAt: date }),
      });
    });
  });

  // --- updateEducatorStatus ---

  describe('updateEducatorStatus', () => {
    it('INACTIVE durumunu SUSPENDED\'a çevirir', async () => {
      mock.user.updateMany.mockResolvedValueOnce({ count: 1 });
      mock.user.findUnique.mockResolvedValueOnce(makeUserRow({ status: 'SUSPENDED' }));

      const result = await repo.updateEducatorStatus('user-1', { status: 'INACTIVE' });
      expect(mock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ status: 'SUSPENDED' }),
      });
      expect(result).not.toBeNull();
    });

    it('kullanıcı bulunamazsa null döner', async () => {
      mock.user.updateMany.mockResolvedValueOnce({ count: 0 });
      const result = await repo.updateEducatorStatus('nonexistent', { status: 'ACTIVE' });
      expect(result).toBeNull();
    });
  });

  // --- listInactiveUsersWithOpenAttempts ---

  describe('listInactiveUsersWithOpenAttempts', () => {
    it('gün eşiğini geçen IN_PROGRESS denemeleri döner', async () => {
      mock.testAttempt.findMany.mockResolvedValueOnce([
        { candidateId: 'cand-1', id: 'att-1' },
        { candidateId: 'cand-2', id: 'att-2' },
      ]);
      const result = await repo.listInactiveUsersWithOpenAttempts(7);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ userId: 'cand-1', attemptId: 'att-1' });
    });
  });

  // --- list ---

  describe('list', () => {
    it('filtre olmadan kullanıcıları listeler', async () => {
      const rows = [makeUserRow(), makeUserRow({ id: 'user-2', email: 'b@b.com', username: 'b' })];
      mock.user.findMany.mockResolvedValueOnce(rows);
      const result = await repo.list({});
      expect(result).toHaveLength(2);
    });

    it('limit 500 ile sınırlandırılır', async () => {
      mock.user.findMany.mockResolvedValueOnce([]);
      await repo.list({ limit: 9999 });
      expect(mock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
    });
  });
});
