import { CreateTestUseCase } from '../../src/application/use-cases/test/CreateTestUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ packageCreationEnabled: true })) },
    // "Diğer" fallback (examTypeId/topicId verilmeyince): bulunamadı → null kalır
    examType: { findUnique: jest.fn(async () => null) },
    topic: { findFirst: jest.fn(async () => null) },
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ET_ID = '11111111-1111-4111-8111-111111111111';
const TP_ID = '22222222-2222-4222-8222-222222222222';

function makeExamRepo(saved: any = null) {
  return { save: jest.fn(async (test: any, questions: any[]) => saved ?? { ...test, questions }) };
}
function makeExamTypeRepo(et: any = { id: ET_ID, name: 'KPSS' }) {
  return { findById: jest.fn(async () => et) };
}
function makeTopicRepo(topic: any = { id: TP_ID, name: 'Tarih', examTypeId: ET_ID }) {
  return { findById: jest.fn(async () => topic) };
}

describe('CreateTestUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  // --- Temel oluşturma ---

  it('temel test oluşturur, UUID atar ve DRAFT statüsü verir', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'KPSS Deneme', educatorId: 'edu-1' });
    const [saved] = repo.save.mock.calls[0];
    expect(saved.id).toMatch(UUID_RE);
    expect(saved.status).toBe('DRAFT');
  });

  // --- Kill-switch ---

  it('packageCreationEnabled=false ise PACKAGE_CREATION_DISABLED fırlatır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce({ packageCreationEnabled: false });
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test' })).rejects.toMatchObject({
      code: 'PACKAGE_CREATION_DISABLED',
      message: expect.stringMatching(/\S/),
    });
  });

  it('adminSettings null ise kill-switch aktif sayılmaz', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test' })).resolves.toBeDefined();
  });

  // --- UUID regex anchor testleri (^ ve $ anchor mutantlarını öldürür) ---

  it('geçersiz UUID formatında examTypeId → INVALID_UUID', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'INVALID_UUID',
      message: expect.stringMatching(/\S/),
    });
  });

  it('UUID başında prefix varsa INVALID_UUID fırlatır (^ anchor)', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: 'prefix-' + ET_ID })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('UUID sonunda suffix varsa INVALID_UUID fırlatır ($ anchor)', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID + '-suffix' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('geçersiz UUID formatında topicId → INVALID_UUID', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID, topicId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'INVALID_UUID',
      message: expect.stringMatching(/\S/),
    });
  });

  // --- ExamType doğrulama ---

  it('examTypeId geçerliyse ama bulunamazsa EXAMTYPE_NOT_FOUND fırlatır', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo(null) as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID })).rejects.toMatchObject({
      code: 'EXAMTYPE_NOT_FOUND',
      message: expect.stringMatching(/\S/),
    });
  });

  // --- Topic doğrulama ---

  it('topicId var ama examTypeId yok ve topic bulunamazsa TOPIC_NOT_FOUND fırlatır', async () => {
    // topicId && !examTypeId dalını test eder; if (false) mutantını öldürür
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo(null) as any);
    await expect(uc.execute({ title: 'Test', topicId: TP_ID })).rejects.toMatchObject({
      code: 'TOPIC_NOT_FOUND',
      message: expect.stringMatching(/\S/),
    });
  });

  it('topicId UUID doğru ama bulunamazsa TOPIC_NOT_FOUND fırlatır', async () => {
    // examTypeId ile birlikte topicId verilen ama topic null; line 63 if(!topic) mutantını öldürür
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo(null) as any);
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID, topicId: TP_ID })).rejects.toMatchObject({
      code: 'TOPIC_NOT_FOUND',
      message: expect.stringMatching(/\S/),
    });
  });

  it('topic examTypeId ile uyuşmazsa TOPIC_EXAMTYPE_MISMATCH fırlatır', async () => {
    const uc = new CreateTestUseCase(
      makeExamRepo() as any, makeExamTypeRepo() as any,
      makeTopicRepo({ id: TP_ID, examTypeId: '33333333-3333-4333-8333-333333333333' }) as any,
    );
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID, topicId: TP_ID })).rejects.toMatchObject({
      code: 'TOPIC_EXAMTYPE_MISMATCH',
      message: expect.stringMatching(/\S/),
    });
  });

  // --- topicId → examTypeId çözümü (line 38 if(topicId && !examTypeId) mutantını öldürür) ---

  it('topicId verilince examTypeId topic üzerinden çözülür ve kaydedilir', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Test', topicId: TP_ID });
    const [saved] = repo.save.mock.calls[0];
    expect(saved.topicId).toBe(TP_ID);
    // examTypeId topic.examTypeId'den çözülmeli (line 43: examTypeId = topic.examTypeId)
    expect(saved.examTypeId).toBe(ET_ID);
  });

  // --- Questions pass-through (array ve arrow function mutantlarını öldürür) ---

  it('questions belirtilmezse boş dizi ile save çağrılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Test' });
    const [, questions] = repo.save.mock.calls[0];
    expect(questions).toEqual([]);
  });

  it('questions belirtilirse UUID atanarak save çağrılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    const input = [{ content: 'Soru 1', options: [] } as any];
    await uc.execute({ title: 'Test', questions: input });
    const [, questions] = repo.save.mock.calls[0];
    expect(questions).toHaveLength(1);
    expect(questions[0].content).toBe('Soru 1');
    expect(questions[0].id).toMatch(UUID_RE); // id atanmış olmalı
  });

  it('questions içindeki mevcut id korunur', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await uc.execute({ title: 'Test', questions: [{ id: existingId, content: 'Q', options: [] } as any] });
    const [, questions] = repo.save.mock.calls[0];
    expect(questions[0].id).toBe(existingId);
  });
});
