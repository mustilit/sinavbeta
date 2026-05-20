// @ts-nocheck
import { CreateTestUseCase } from '../../src/application/use-cases/test/CreateTestUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ packageCreationEnabled: true })) },
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Valid UUIDs for fixtures
const ET_ID = '11111111-1111-4111-8111-111111111111';
const TP_ID = '22222222-2222-4222-8222-222222222222';

function makeExamRepo(saved: any = null) {
  return { save: jest.fn(async (test: any) => saved ?? test) };
}
function makeExamTypeRepo(et: any = { id: ET_ID, name: 'KPSS' }) {
  return { findById: jest.fn(async () => et) };
}
function makeTopicRepo(topic: any = { id: TP_ID, name: 'Tarih', examTypeId: ET_ID }) {
  return { findById: jest.fn(async () => topic) };
}

describe('CreateTestUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('temel test oluşturur ve UUID atar', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'KPSS Deneme', educatorId: 'edu-1' });
    const saved = repo.save.mock.calls[0][0];
    expect(saved.id).toMatch(UUID_RE);
    expect(saved.status).toBe('DRAFT');
  });

  it('packageCreationEnabled=false ise PACKAGE_CREATION_DISABLED fırlatır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce({ packageCreationEnabled: false });
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test' })).rejects.toMatchObject({ code: 'PACKAGE_CREATION_DISABLED' });
  });

  it('geçersiz examTypeId → EXAMTYPE_NOT_FOUND', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo(null) as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID })).rejects.toMatchObject({ code: 'EXAMTYPE_NOT_FOUND' });
  });

  it('geçersiz UUID formatında examTypeId → INVALID_UUID', async () => {
    const uc = new CreateTestUseCase(makeExamRepo() as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test', examTypeId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('topic examTypeId ile uyuşmazsa TOPIC_EXAMTYPE_MISMATCH', async () => {
    const uc = new CreateTestUseCase(
      makeExamRepo() as any, makeExamTypeRepo() as any,
      makeTopicRepo({ id: TP_ID, examTypeId: '33333333-3333-4333-8333-333333333333' }) as any,
    );
    await expect(uc.execute({ title: 'Test', examTypeId: ET_ID, topicId: TP_ID })).rejects.toMatchObject({ code: 'TOPIC_EXAMTYPE_MISMATCH' });
  });

  it('topicId verildikten examTypeId çözülür', async () => {
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await uc.execute({ title: 'Test', topicId: TP_ID });
    expect(repo.save.mock.calls[0][0].topicId).toBe(TP_ID);
  });

  it('adminSettings null ise kill-switch aktif sayılmaz', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const repo = makeExamRepo();
    const uc = new CreateTestUseCase(repo as any, makeExamTypeRepo() as any, makeTopicRepo() as any);
    await expect(uc.execute({ title: 'Test' })).resolves.toBeDefined();
  });
});
