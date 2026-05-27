/**
 * PrismaAuditLogRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { PrismaAuditLogRepository } from '../../src/infrastructure/repositories/PrismaAuditLogRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeRow = (overrides: Partial<any> = {}) => ({
  id: 'log-1',
  action: 'PURCHASE',
  entityType: 'Purchase',
  entityId: 'pur-1',
  actorId: 'user-1',
  metadata: {},
  createdAt: new Date(),
  ...overrides,
});

describe('PrismaAuditLogRepository', () => {
  let repo: PrismaAuditLogRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaAuditLogRepository();
  });

  // --- create ---

  describe('create', () => {
    it('yeni audit logu kaydeder ve domain nesnesini döner', async () => {
      // Arrange
      const row = makeRow();
      mock.auditLog.create.mockResolvedValueOnce(row);

      // Act
      const result = await repo.create({
        action: 'PURCHASE',
        entityType: 'Purchase',
        entityId: 'pur-1',
        actorId: 'user-1',
        metadata: {},
      });

      // Assert
      expect(result.id).toBe('log-1');
      expect(result.action).toBe('PURCHASE');
      expect(mock.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('ACTION_MAP alias\'larını Prisma enum\'una çevirir', async () => {
      // Arrange
      mock.auditLog.create.mockResolvedValueOnce(makeRow({ action: 'REFUND_REQUESTED' }));

      // Act
      await repo.create({ action: 'REFUND', entityType: 'RefundRequest', entityId: 'r-1' });

      // Assert
      expect(mock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REFUND_REQUESTED' }),
        }),
      );
    });

    it('actorId null olarak geçildiğinde null kaydeder', async () => {
      // Arrange
      mock.auditLog.create.mockResolvedValueOnce(makeRow({ actorId: null }));

      // Act
      await repo.create({ action: 'PURCHASE', entityType: 'Purchase', entityId: 'p-1' });

      // Assert
      expect(mock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actorId: null }),
        }),
      );
    });
  });

  // --- list ---

  describe('list', () => {
    it('filtre olmadan tüm logları sayfalı döner', async () => {
      // Arrange
      mock.auditLog.count.mockResolvedValueOnce(2);
      mock.auditLog.findMany.mockResolvedValueOnce([makeRow(), makeRow({ id: 'log-2' })]);

      // Act
      const result = await repo.list({});

      // Assert
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('action ve actorId filtresi uygulanır', async () => {
      // Arrange
      mock.auditLog.count.mockResolvedValueOnce(1);
      mock.auditLog.findMany.mockResolvedValueOnce([makeRow()]);

      // Act
      await repo.list({ action: 'PURCHASE' as any, actorId: 'user-1' });

      // Assert
      expect(mock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'PURCHASE', actorId: 'user-1' }),
        }),
      );
    });

    it('tarih aralığı filtresi createdAt koşuluna çevrilir', async () => {
      // Arrange
      mock.auditLog.count.mockResolvedValueOnce(0);
      mock.auditLog.findMany.mockResolvedValueOnce([]);
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');

      // Act
      await repo.list({ from, to });

      // Assert
      expect(mock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('limit 200 ile kısıtlanır', async () => {
      // Arrange
      mock.auditLog.count.mockResolvedValueOnce(0);
      mock.auditLog.findMany.mockResolvedValueOnce([]);

      // Act
      await repo.list({ limit: 9999 });

      // Assert
      expect(mock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });
});
