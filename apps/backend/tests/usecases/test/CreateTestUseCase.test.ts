/**
 * CreateTestUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kill-switch aktifse PACKAGE_CREATION_DISABLED
 * - topicId var ama examTypeId yoksa topic üzerinden examTypeId set edilir
 * - Topic bulunamazsa TOPIC_NOT_FOUND
 * - Geçersiz UUID → INVALID_UUID
 * - ExamType bulunamazsa EXAMTYPE_NOT_FOUND
 * - Topic ile examType uyuşmuyorsa TOPIC_EXAMTYPE_MISMATCH
 * - Başarı: examRepository.save çağrılır
 */

const mockAdminSettings = jest.fn();
const mockExamTypeFindUnique = jest.fn();
const mockTopicFindFirst = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettings(...args) },
    examType: { findUnique: (...args: any[]) => mockExamTypeFindUnique(...args) },
    gradeLevel: { findUnique: jest.fn(async () => ({ id: 'genel-id' })) },
    topic: { findFirst: (...args: any[]) => mockTopicFindFirst(...args) },
  },
}));

import { CreateTestUseCase } from '../../../src/application/use-cases/test/CreateTestUseCase';
import { AppError } from '../../../src/application/errors/AppError';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID2 = '660e8400-e29b-41d4-a716-446655440000';
const OTHER_EXAMTYPE = { id: 'other-examtype-id', slug: 'diger', name: 'Diğer' };
const OTHER_TOPIC = { id: 'other-topic-id', slug: 'diger', name: 'Diğer' };

function makeExamRepo(saveResult: any = { id: 'test-1' }) {
  return { save: jest.fn().mockResolvedValue(saveResult) };
}

function makeExamTypeRepo(found: any = { id: VALID_UUID, name: 'YKS' }) {
  return { findById: jest.fn().mockResolvedValue(found) };
}

function makeTopicRepo(found: any = { id: VALID_UUID2, name: 'Matematik', examTypeId: VALID_UUID }) {
  return { findById: jest.fn().mockResolvedValue(found) };
}

describe('CreateTestUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSettings.mockResolvedValue({ id: 1, packageCreationEnabled: true });
    // "Diğer" fallback satırları (slug='diger') varsayılan olarak bulunur
    mockExamTypeFindUnique.mockResolvedValue(OTHER_EXAMTYPE);
    mockTopicFindFirst.mockResolvedValue(OTHER_TOPIC);
  });

  it('kill-switch aktifse PACKAGE_CREATION_DISABLED fırlatır', async () => {
    mockAdminSettings.mockResolvedValue({ id: 1, packageCreationEnabled: false });
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'T', educatorId: 'edu-1' })).rejects.toMatchObject({ code: 'PACKAGE_CREATION_DISABLED' });
  });

  it('geçersiz examTypeId UUID → INVALID_UUID fırlatır', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'T', examTypeId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('examType bulunamazsa EXAMTYPE_NOT_FOUND fırlatır', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo(null) as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'T', examTypeId: VALID_UUID })).rejects.toMatchObject({ code: 'EXAMTYPE_NOT_FOUND' });
  });

  it('topicId var ama topic bulunamazsa TOPIC_NOT_FOUND fırlatır', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo(null) as any);
    await expect(uc.execute({ title: 'T', examTypeId: VALID_UUID, topicId: VALID_UUID2 })).rejects.toMatchObject({ code: 'TOPIC_NOT_FOUND' });
  });

  it('topic ile examType uyuşmuyorsa TOPIC_EXAMTYPE_MISMATCH fırlatır', async () => {
    const topic = { id: VALID_UUID2, examTypeId: '770e8400-e29b-41d4-a716-446655440000' }; // farklı examTypeId
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo(topic) as any);
    await expect(uc.execute({ title: 'T', examTypeId: VALID_UUID, topicId: VALID_UUID2 })).rejects.toMatchObject({ code: 'TOPIC_EXAMTYPE_MISMATCH' });
  });

  it('topicId var ama examTypeId yoksa topic üzerinden examTypeId belirlenir', async () => {
    const examRepo = makeExamRepo();
    const topicRepo = makeTopicRepo({ id: VALID_UUID2, examTypeId: VALID_UUID });
    const examTypeRepo = makeExamTypeRepo();
    const uc = new CreateTestUseCase(examRepo as any, examTypeRepo as any, topicRepo as any);
    await uc.execute({ title: 'T', topicId: VALID_UUID2 });
    expect(examRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ examTypeId: VALID_UUID }),
      expect.any(Array),
    );
  });

  it('başarı: examRepository.save çağrılır', async () => {
    const examRepo = makeExamRepo();
    const uc = new CreateTestUseCase(examRepo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Test Başlığı', educatorId: 'edu-1' });
    expect(examRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Başlığı' }),
      expect.any(Array),
    );
  });

  it('sınav türü ve konu seçilmezse "Diğer" (slug=diger) atanır', async () => {
    const examRepo = makeExamRepo();
    const uc = new CreateTestUseCase(examRepo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Türsüz Test', educatorId: 'edu-1' });
    expect(mockExamTypeFindUnique).toHaveBeenCalledWith({ where: { slug: 'diger' } });
    expect(mockTopicFindFirst).toHaveBeenCalledWith({ where: { slug: 'diger' } });
    expect(examRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ examTypeId: OTHER_EXAMTYPE.id, topicId: OTHER_TOPIC.id }),
      expect.any(Array),
    );
  });

  it('sınav türü verilirse "Diğer" examType lookup yapılmaz (sadece konu fallback)', async () => {
    const examRepo = makeExamRepo();
    const uc = new CreateTestUseCase(examRepo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Türlü Test', educatorId: 'edu-1', examTypeId: VALID_UUID });
    expect(mockExamTypeFindUnique).not.toHaveBeenCalled();
    expect(mockTopicFindFirst).toHaveBeenCalledWith({ where: { slug: 'diger' } });
    expect(examRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ examTypeId: VALID_UUID, topicId: OTHER_TOPIC.id }),
      expect.any(Array),
    );
  });
});
