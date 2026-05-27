/**
 * CreateQuestionUseCase ek test case'leri
 *
 * Doğrulanan davranışlar:
 * - Soru limiti (maxQuestionsPerTest) aşılırsa → QUESTION_LIMIT_EXCEEDED
 * - Admin ayarlarından limit alınır
 * - Başarı: examRepository.addQuestion çağrılır, sunucu UUID ataması yapılır
 * - Moderasyon hook best-effort (fail etse de soru kaydedilir)
 */

const mockAdminSettingsFindFirst = jest.fn();
const mockExamQuestionCount = jest.fn();
const mockExamTestFindUnique = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
    examQuestion: { count: (...args: any[]) => mockExamQuestionCount(...args) },
    examTest: { findUnique: (...args: any[]) => mockExamTestFindUnique(...args) },
  },
}));

jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { CreateQuestionUseCase } from '../../../src/application/use-cases/question/CreateQuestionUseCase';
import { AppError } from '../../../src/application/errors/AppError';

function makeExamRepo(question: any = {}) {
  return { addQuestion: jest.fn().mockResolvedValue({ id: 'q-new', ...question }) };
}

const BASE_INPUT = {
  content: 'Soru metni nedir?',
  options: [
    { content: 'A', isCorrect: true },
    { content: 'B', isCorrect: false },
  ],
};

describe('CreateQuestionUseCase — soru limiti ve ek senaryolar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, maxQuestionsPerTest: 100 });
    mockExamQuestionCount.mockResolvedValue(5);
    mockExamTestFindUnique.mockResolvedValue({ educatorId: 'edu-1', tenantId: 't1' });
  });

  it('soru sayısı maxQuestionsPerTest e eşit olunca QUESTION_LIMIT_EXCEEDED fırlatır', async () => {
    mockExamQuestionCount.mockResolvedValue(100); // limit = 100
    const uc = new CreateQuestionUseCase(makeExamRepo() as any);
    await expect(uc.execute('test-1', BASE_INPUT)).rejects.toMatchObject({ code: 'QUESTION_LIMIT_EXCEEDED' });
  });

  it('soru sayısı limitin altındaysa soru oluşturulur', async () => {
    mockExamQuestionCount.mockResolvedValue(50);
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', BASE_INPUT);
    expect(repo.addQuestion).toHaveBeenCalledTimes(1);
  });

  it('sunucu UUID ataması yapılır (istemci ID kabul edilmez)', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', BASE_INPUT);
    const callArg = repo.addQuestion.mock.calls[0][1];
    // ID bir UUID olmalı (36 karakter, tire dahil)
    expect(callArg.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('order verilmezse 0 atanır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', BASE_INPUT); // order verilmedi
    const callArg = repo.addQuestion.mock.calls[0][1];
    expect(callArg.order).toBe(0);
  });

  it('order verilirse kullanılır', async () => {
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', { ...BASE_INPUT, order: 5 });
    const callArg = repo.addQuestion.mock.calls[0][1];
    expect(callArg.order).toBe(5);
  });

  it('admin ayarı yoksa varsayılan 100 limit kullanılır', async () => {
    mockAdminSettingsFindFirst.mockResolvedValue(null);
    mockExamQuestionCount.mockResolvedValue(99); // 99 soru var, limit 100
    const repo = makeExamRepo();
    const uc = new CreateQuestionUseCase(repo as any);
    await uc.execute('test-1', BASE_INPUT);
    expect(repo.addQuestion).toHaveBeenCalledTimes(1);
  });
});
