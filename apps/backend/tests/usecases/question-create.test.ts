import { CreateQuestionUseCase } from '../../src/application/use-cases/question/CreateQuestionUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ maxQuestionsPerTest: 100 })) },
    examQuestion: { count: jest.fn(async () => 0) },
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeExamRepo(saved: any = null) {
  return { addQuestion: jest.fn(async (_tid: string, q: any) => saved ?? q) };
}
function makeOptions(n = 2) {
  return Array.from({ length: n }, (_, i) => ({ content: `Seçenek ${i + 1}`, isCorrect: i === 0 }));
}

describe('CreateQuestionUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soru ve seçeneklere sunucu UUID atar', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru metni', options: makeOptions() });
    const q = repo.addQuestion.mock.calls[0][1];
    expect(q.id).toMatch(UUID_RE);
    expect(q.options[0].id).toMatch(UUID_RE);
  });

  it('order verilmezse 0 atanır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: makeOptions() });
    expect(repo.addQuestion.mock.calls[0][1].order).toBe(0);
  });

  it('verilen order korunur', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', order: 5, options: makeOptions() });
    expect(repo.addQuestion.mock.calls[0][1].order).toBe(5);
  });

  it('soru limiti dolmuşsa QUESTION_LIMIT_EXCEEDED fırlatır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce({ maxQuestionsPerTest: 5 });
    (prisma.examQuestion.count as jest.Mock).mockResolvedValueOnce(5);
    const uc = new CreateQuestionUseCase(makeExamRepo() as any);
    await expect(uc.execute('test-1', { content: 'Soru', options: makeOptions() }))
      .rejects.toMatchObject({ code: 'QUESTION_LIMIT_EXCEEDED' });
  });

  it('adminSettings null ise varsayılan limit 100 kullanılır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.examQuestion.count as jest.Mock).mockResolvedValueOnce(99);
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await expect(uc.execute('test-1', { content: 'Soru', options: makeOptions() })).resolves.toBeDefined();
  });

  it('mediaUrl null olarak kaydedilir (varsayılan)', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: makeOptions() });
    expect(repo.addQuestion.mock.calls[0][1].mediaUrl).toBeNull();
  });

  it('seçenek sayısı doğru aktarılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: makeOptions(4) });
    expect(repo.addQuestion.mock.calls[0][1].options).toHaveLength(4);
  });
});
