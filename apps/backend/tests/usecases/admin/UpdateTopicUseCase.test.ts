/**
 * UpdateTopicUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Konu bulunamazsa 404 hata
 * - name güncellenirse slug de yeniden üretilir
 * - examTypeIds güncellenirse tüm bağlantılar sıfırlanıp yeniden oluşturulur
 * - Başarı: güncellenmiş konu döner
 * - Audit log yazılır (best-effort)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    topic: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    topicExamType: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

import { UpdateTopicUseCase } from '../../../src/application/use-cases/admin/UpdateTopicUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeUpdatedTopic(overrides: any = {}) {
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

describe('UpdateTopicUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Eski Ad', slug: 'eski-ad' });
    mockPrisma.topic.update.mockResolvedValue(makeUpdatedTopic());
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('konu bulunamazsa 404 hata fırlatır', async () => {
    mockPrisma.topic.findUnique.mockResolvedValue(null);
    const uc = new UpdateTopicUseCase();
    await expect(uc.execute('bad-topic', { name: 'Yeni' })).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.topic.update).not.toHaveBeenCalled();
  });

  it('name güncellenirse slug de yeniden üretilir', async () => {
    const uc = new UpdateTopicUseCase();
    await uc.execute('topic-1', { name: 'Fizik Bilimi' });
    expect(mockPrisma.topic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Fizik Bilimi', slug: 'fizik-bilimi' }),
      }),
    );
  });

  it('examTypeIds güncellenirse deleteMany + createMany çağrılır', async () => {
    const uc = new UpdateTopicUseCase();
    await uc.execute('topic-1', { examTypeIds: ['et-1', 'et-2'] });
    expect(mockPrisma.topicExamType.deleteMany).toHaveBeenCalledWith({ where: { topicId: 'topic-1' } });
    expect(mockPrisma.topicExamType.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          { topicId: 'topic-1', examTypeId: 'et-1' },
          { topicId: 'topic-1', examTypeId: 'et-2' },
        ]),
      }),
    );
  });

  it('examTypeIds boş dizi ise sadece deleteMany çağrılır', async () => {
    const uc = new UpdateTopicUseCase();
    await uc.execute('topic-1', { examTypeIds: [] });
    expect(mockPrisma.topicExamType.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.topicExamType.createMany).not.toHaveBeenCalled();
  });

  it('başarı: güncellenmiş konu döner', async () => {
    const uc = new UpdateTopicUseCase();
    const result = await uc.execute('topic-1', { active: false });
    expect(result.id).toBe('topic-1');
  });

  it('audit log TOPIC_UPDATED action ile yazılır', async () => {
    const uc = new UpdateTopicUseCase();
    await uc.execute('topic-1', { name: 'Güncel Konu' }, 'admin-1');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TOPIC_UPDATED', actorId: 'admin-1' }),
    });
  });

  it('audit log hatası fırlatmaz', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('AUDIT_FAIL'));
    const uc = new UpdateTopicUseCase();
    await expect(uc.execute('topic-1', { active: false })).resolves.toBeDefined();
  });
});
