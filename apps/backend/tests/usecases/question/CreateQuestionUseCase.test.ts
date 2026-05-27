/**
 * CreateQuestionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - maxQuestionsPerTest aşılırsa QUESTION_LIMIT_EXCEEDED
 * - Başarı: examRepository.addQuestion çağrılır
 * - Sunucu tarafında UUID üretilir (istemci ID'si atlanır)
 * - order verilmezse 0 atanır
 * - Moderasyon hook'u (best-effort) — test fail'e çekmesin
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn().mockResolvedValue({ maxQuestionsPerTest: 100 }) },
    examQuestion: { count: jest.fn().mockResolvedValue(0) },
    examTest: { findUnique: jest.fn().mockResolvedValue({ educatorId: 'edu-1', tenantId: 'tenant-1' }) },
  },
}));

import { CreateQuestionUseCase } from '../../../src/application/use-cases/question/CreateQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

const VALID_OPTIONS = [
  { content: 'Seçenek A', isCorrect: true },
  { content: 'Seçenek B', isCorrect: false },
];

function makeExamRepo(created: any = null) {
  return {
    addQuestion: jest.fn().mockImplementation(async (_testId: string, q: any) => created ?? { ...q }),
  };
}

describe('CreateQuestionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ maxQuestionsPerTest: 100 });
    mockPrisma.examQuestion.count.mockResolvedValue(0);
    mockPrisma.examTest.findUnique.mockResolvedValue({ educatorId: 'edu-1', tenantId: 'tenant-1' });
  });

  it('soru limiti dolmuşsa QUESTION_LIMIT_EXCEEDED fırlatır', async () => {
    mockPrisma.examQuestion.count.mockResolvedValue(100);
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await expect(
      uc.execute('test-1', { content: 'Soru metni', options: VALID_OPTIONS }),
    ).rejects.toMatchObject({ code: 'QUESTION_LIMIT_EXCEEDED' });
    expect(repo.addQuestion).not.toHaveBeenCalled();
  });

  it('adminSettings null ise limit 100 olarak kullanılır', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue(null);
    mockPrisma.examQuestion.count.mockResolvedValue(99);
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await expect(
      uc.execute('test-1', { content: 'Soru metni', options: VALID_OPTIONS }),
    ).resolves.toBeDefined();
  });

  it('başarı: examRepository.addQuestion çağrılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Yeni soru', options: VALID_OPTIONS });
    expect(repo.addQuestion).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({ content: 'Yeni soru', testId: 'test-1' }),
    );
  });

  it('order verilmezse 0 atanır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: VALID_OPTIONS });
    expect(repo.addQuestion).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({ order: 0 }),
    );
  });

  it('order verilirse o değer kullanılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: VALID_OPTIONS, order: 5 });
    expect(repo.addQuestion).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({ order: 5 }),
    );
  });

  it('her seçeneğe UUID atanır (istemci ID yok)', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: VALID_OPTIONS });
    const call = repo.addQuestion.mock.calls[0][1];
    expect(call.options[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.options[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.options[0].id).not.toEqual(call.options[1].id);
  });

  it('solutionText null olarak saklanır eğer verilmezse', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { content: 'Soru', options: VALID_OPTIONS });
    expect(repo.addQuestion).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({ solutionText: null }),
    );
  });
});
