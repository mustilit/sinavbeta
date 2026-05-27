/**
 * DeleteQuestionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Soru bulunamazsa NOT_FOUND
 * - testId uyuşmazsa NOT_FOUND
 * - Actor başkasının sorusunu silmeye çalışırsa FORBIDDEN
 * - Soru cevaplanmışsa QUESTION_HAS_ATTEMPTS
 * - Başarı: prisma.examQuestion.delete çağrılır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examQuestion: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'q-1' }),
    },
    attemptAnswer: { count: jest.fn().mockResolvedValue(0) },
  },
}));

import { DeleteQuestionUseCase } from '../../../src/application/use-cases/question/DeleteQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeQuestion(overrides: any = {}) {
  return {
    testId: 'test-1',
    test: { educatorId: 'edu-1' },
    ...overrides,
  };
}

describe('DeleteQuestionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.examQuestion.findUnique.mockResolvedValue(makeQuestion());
    mockPrisma.attemptAnswer.count.mockResolvedValue(0);
    mockPrisma.examQuestion.delete.mockResolvedValue({ id: 'q-1' });
  });

  it('soru bulunamazsa NOT_FOUND fırlatır', async () => {
    mockPrisma.examQuestion.findUnique.mockResolvedValue(null);
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'bad-q', 'edu-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockPrisma.examQuestion.delete).not.toHaveBeenCalled();
  });

  it('testId uyuşmazsa NOT_FOUND fırlatır', async () => {
    mockPrisma.examQuestion.findUnique.mockResolvedValue(makeQuestion({ testId: 'other-test' }));
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('başkasının sorusunu silinince FORBIDDEN fırlatır', async () => {
    mockPrisma.examQuestion.findUnique.mockResolvedValue(
      makeQuestion({ test: { educatorId: 'other-edu' } }),
    );
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPrisma.examQuestion.delete).not.toHaveBeenCalled();
  });

  it('soru cevaplanmışsa QUESTION_HAS_ATTEMPTS fırlatır', async () => {
    mockPrisma.attemptAnswer.count.mockResolvedValue(3);
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({
      code: 'QUESTION_HAS_ATTEMPTS',
    });
    expect(mockPrisma.examQuestion.delete).not.toHaveBeenCalled();
  });

  it('başarı: prisma.examQuestion.delete çağrılır', async () => {
    const uc = new DeleteQuestionUseCase();
    await uc.execute('test-1', 'q-1', 'edu-1');
    expect(mockPrisma.examQuestion.delete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });

  it('cevaplanmamış soru başarıyla silinir', async () => {
    mockPrisma.attemptAnswer.count.mockResolvedValue(0);
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).resolves.toBeUndefined();
  });
});
