/**
 * SubmitAnswerUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - attemptId veya questionId eksikse INVALID_INPUT
 * - Deneme bulunamazsa ATTEMPT_NOT_FOUND
 * - Başka kullanıcı → NOT_ATTEMPT_OWNER
 * - Deneme IN_PROGRESS değilse ATTEMPT_NOT_IN_PROGRESS
 * - Soru bu teste ait değilse QUESTION_NOT_IN_TEST
 * - Şık bu soruya ait değilse OPTION_NOT_IN_QUESTION
 * - selectedOptionId yoksa cevap silinir ($transaction deleteMany)
 * - Başarı: $transaction upsert çağrılır
 */

const mockFindUnique = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

import { SubmitAnswerUseCase } from '../../../src/application/use-cases/attempt/SubmitAnswerUseCase';
import { BadRequestException } from '@nestjs/common';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    testAttempt: { findUnique: mockFindUnique },
    examQuestion: { findUnique: jest.fn() },
    examOption: { findUnique: jest.fn() },
    attemptAnswer: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: mockTransaction,
    ...overrides,
  } as any;
}

function makeAttempt(overrides: Record<string, any> = {}) {
  return {
    id: 'att-1',
    candidateId: 'user-1',
    testId: 'test-1',
    status: 'IN_PROGRESS',
    remainingSec: null,
    startedAt: new Date(),
    lastResumedAt: null,
    ...overrides,
  };
}

describe('SubmitAnswerUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attemptId eksikse INVALID_INPUT fırlatır', async () => {
    const uc = new SubmitAnswerUseCase(makePrisma());
    await expect(uc.execute('', 'q1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('questionId eksikse INVALID_INPUT fırlatır', async () => {
    const uc = new SubmitAnswerUseCase(makePrisma());
    await expect(uc.execute('att-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deneme bulunamazsa ATTEMPT_NOT_FOUND fırlatır', async () => {
    mockFindUnique.mockResolvedValue(null);
    const uc = new SubmitAnswerUseCase(makePrisma());
    await expect(uc.execute('att-1', 'q1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('başka kullanıcı → NOT_ATTEMPT_OWNER fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const uc = new SubmitAnswerUseCase(makePrisma());
    await expect(uc.execute('att-1', 'q1', undefined, 'other')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SUBMITTED deneme → ATTEMPT_NOT_IN_PROGRESS fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt({ status: 'SUBMITTED' }));
    const uc = new SubmitAnswerUseCase(makePrisma());
    await expect(uc.execute('att-1', 'q1', 'o1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soru bu teste ait değilse QUESTION_NOT_IN_TEST fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const prismaObj = makePrisma();
    (prismaObj.examQuestion.findUnique as jest.Mock).mockResolvedValue({ id: 'q1', testId: 'other-test' });
    const uc = new SubmitAnswerUseCase(prismaObj);
    await expect(uc.execute('att-1', 'q1', 'o1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('selectedOptionId yoksa $transaction deleteMany çağrılır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const prismaObj = makePrisma();
    (prismaObj.examQuestion.findUnique as jest.Mock).mockResolvedValue({ id: 'q1', testId: 'test-1' });
    mockTransaction.mockImplementation(async (arr: any[]) => {
      // Dizi transaction: her item'ı execute et
      return Promise.all(arr.map((p) => p));
    });
    prismaObj.attemptAnswer.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const uc = new SubmitAnswerUseCase(prismaObj);
    await uc.execute('att-1', 'q1', null, 'user-1');
    expect(prismaObj.attemptAnswer.deleteMany).toHaveBeenCalled();
  });

  it('şık soruya ait değilse OPTION_NOT_IN_QUESTION fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const prismaObj = makePrisma();
    (prismaObj.examQuestion.findUnique as jest.Mock).mockResolvedValue({ id: 'q1', testId: 'test-1' });
    (prismaObj.examOption.findUnique as jest.Mock).mockResolvedValue({ id: 'o1', questionId: 'other-q' });
    const uc = new SubmitAnswerUseCase(prismaObj);
    await expect(uc.execute('att-1', 'q1', 'o1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('başarılı cevap: $transaction upsert çağrılır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const prismaObj = makePrisma();
    (prismaObj.examQuestion.findUnique as jest.Mock).mockResolvedValue({ id: 'q1', testId: 'test-1' });
    (prismaObj.examOption.findUnique as jest.Mock).mockResolvedValue({ id: 'o1', questionId: 'q1', isCorrect: true });
    const upsertMock = jest.fn().mockResolvedValue({ attemptId: 'att-1', questionId: 'q1', selectedOptionId: 'o1' });
    mockTransaction.mockImplementation(async (arr: any[]) => Promise.all(arr.map((p) => p)));
    prismaObj.attemptAnswer = { ...prismaObj.attemptAnswer, upsert: upsertMock };
    prismaObj.auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    const uc = new SubmitAnswerUseCase(prismaObj);
    await uc.execute('att-1', 'q1', 'o1', 'user-1');
    expect(upsertMock).toHaveBeenCalled();
  });
});
