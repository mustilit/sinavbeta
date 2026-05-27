/**
 * DeleteTopicUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Konu bulunamazsa 404 hata
 * - Alt konular yetim bırakılır (parentId = null)
 * - Başarı: { deleted: true } döner
 * - Audit log yazılır (best-effort)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    topic: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({ id: 'topic-1' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

import { DeleteTopicUseCase } from '../../../src/application/use-cases/admin/DeleteTopicUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('DeleteTopicUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Matematik' });
    mockPrisma.topic.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.topic.delete.mockResolvedValue({ id: 'topic-1' });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('konu bulunamazsa 404 hata fırlatır', async () => {
    mockPrisma.topic.findUnique.mockResolvedValue(null);
    const uc = new DeleteTopicUseCase();
    await expect(uc.execute('bad-topic')).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.topic.delete).not.toHaveBeenCalled();
  });

  it('alt konular yetim bırakılır (parentId = null)', async () => {
    const uc = new DeleteTopicUseCase();
    await uc.execute('topic-1');
    expect(mockPrisma.topic.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 'topic-1' },
        data: { parentId: null },
      }),
    );
  });

  it('başarı: topic silinir ve { deleted: true } döner', async () => {
    const uc = new DeleteTopicUseCase();
    const result = await uc.execute('topic-1');
    expect(mockPrisma.topic.delete).toHaveBeenCalledWith({ where: { id: 'topic-1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('audit log TOPIC_DELETED action ile yazılır', async () => {
    const uc = new DeleteTopicUseCase();
    await uc.execute('topic-1', 'admin-1');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TOPIC_DELETED', actorId: 'admin-1', entityId: 'topic-1' }),
    });
  });

  it('audit log hatası fırlatmaz (best-effort)', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('AUDIT_FAIL'));
    const uc = new DeleteTopicUseCase();
    await expect(uc.execute('topic-1')).resolves.toEqual({ deleted: true });
  });
});
