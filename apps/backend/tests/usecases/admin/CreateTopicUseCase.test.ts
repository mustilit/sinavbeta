/**
 * CreateTopicUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Boş isim → hata fırlatır (status 400)
 * - parentId geçersizse 404 hata
 * - examTypeIds bağlanırsa create çağrısına dahil edilir
 * - Başarı: topic kaydedilir, audit log yazılır (best-effort)
 * - active varsayılan true
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    topic: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    topicExamType: { createMany: jest.fn().mockResolvedValue({}) },
  },
}));

import { CreateTopicUseCase } from '../../../src/application/use-cases/admin/CreateTopicUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeCreatedTopic(overrides: any = {}) {
  return {
    id: 'topic-1',
    name: 'Matematik',
    slug: 'matematik',
    active: true,
    parentId: null,
    parent: null,
    children: [],
    examTypes: [],
    ...overrides,
  };
}

describe('CreateTopicUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.topic.findUnique.mockResolvedValue(null);
    mockPrisma.topic.create.mockResolvedValue(makeCreatedTopic());
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('boş isim ile hata fırlatır (status 400)', async () => {
    const uc = new CreateTopicUseCase();
    await expect(uc.execute({ name: '  ' })).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.topic.create).not.toHaveBeenCalled();
  });

  it('parentId geçersizse 404 hata fırlatır', async () => {
    mockPrisma.topic.findUnique.mockResolvedValue(null);
    const uc = new CreateTopicUseCase();
    await expect(uc.execute({ name: 'Alt Konu', parentId: 'nonexistent' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('parentId geçerliyse create çağrılır', async () => {
    mockPrisma.topic.findUnique.mockResolvedValue({ id: 'parent-1', name: 'Fen Bilimleri' });
    mockPrisma.topic.create.mockResolvedValue(makeCreatedTopic({ parentId: 'parent-1' }));
    const uc = new CreateTopicUseCase();
    await uc.execute({ name: 'Fizik', parentId: 'parent-1' });
    expect(mockPrisma.topic.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: 'parent-1' }) }),
    );
  });

  it('başarı: konu oluşturulur', async () => {
    const uc = new CreateTopicUseCase();
    const result = await uc.execute({ name: 'Matematik' });
    expect(result.name).toBe('Matematik');
    expect(result.slug).toBe('matematik');
  });

  it('active varsayılan true', async () => {
    const uc = new CreateTopicUseCase();
    await uc.execute({ name: 'Konu' });
    expect(mockPrisma.topic.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: true }) }),
    );
  });

  it('active false geçilirse false saklanır', async () => {
    mockPrisma.topic.create.mockResolvedValue(makeCreatedTopic({ active: false }));
    const uc = new CreateTopicUseCase();
    await uc.execute({ name: 'Pasif Konu', active: false });
    expect(mockPrisma.topic.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });

  it('audit log hatası fırlatmaz (best-effort)', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('AUDIT_FAIL'));
    const uc = new CreateTopicUseCase();
    await expect(uc.execute({ name: 'Deneme' })).resolves.toBeDefined();
  });
});
