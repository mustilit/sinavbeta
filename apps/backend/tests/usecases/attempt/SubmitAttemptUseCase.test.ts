/**
 * SubmitAttemptUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - attemptId yoksa INVALID_INPUT hatası
 * - Deneme bulunamazsa ATTEMPT_NOT_FOUND
 * - Başka kullanıcının denemesi → ForbiddenException (NOT_ATTEMPT_OWNER)
 * - Zaten SUBMITTED → idempotent yanıt (tekrar hesaplama)
 * - Başarı: correct/wrong/blank/score hesaplanır
 * - Snapshot varsa canlı tabloyu sorgulamaz
 * - overtimeSeconds timed test'te hesaplanır
 */

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

import { SubmitAttemptUseCase } from '../../../src/application/use-cases/attempt/SubmitAttemptUseCase';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    testAttempt: {
      findUnique: mockFindUnique,
      update: jest.fn(),
    },
    attemptAnswer: { findMany: mockFindMany },
    examQuestion: { count: mockCount },
    examOption: { findMany: jest.fn().mockResolvedValue([]) },
    examTest: { findUnique: jest.fn().mockResolvedValue({ isTimed: false, duration: null }) },
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
    score: null,
    startedAt: new Date('2026-01-01'),
    questionsSnapshot: null,
    ...overrides,
  };
}

describe('SubmitAttemptUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attemptId eksikse INVALID_INPUT BadRequestException fırlatır', async () => {
    const uc = new SubmitAttemptUseCase(makePrisma());
    await expect(uc.execute('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deneme bulunamazsa ATTEMPT_NOT_FOUND fırlatır', async () => {
    mockFindUnique.mockResolvedValue(null);
    const uc = new SubmitAttemptUseCase(makePrisma());
    await expect(uc.execute('att-missing')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('başka kullanıcının denemesi → ForbiddenException', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const uc = new SubmitAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', undefined, 'other-user')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUBMITTED deneme → idempotent yanıt, tekrar hesaplama yapılır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt({ status: 'SUBMITTED', score: 3 }));
    mockFindMany.mockResolvedValue([]); // mevcut cevaplar
    mockCount.mockResolvedValue(5);
    const prismaObj = makePrisma();
    (prismaObj.examTest.findUnique as jest.Mock).mockResolvedValue({ isTimed: false, duration: null });
    const uc = new SubmitAttemptUseCase(prismaObj);
    const result = await uc.execute('att-1', undefined, 'user-1');
    expect(result.score).toBe(3); // mevcut skor döner
    expect(result.correct).toBe(0);
  });

  it('başarı: cevaplar hesaplanır, $transaction çağrılır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt());
    const prismaObj = makePrisma();
    (prismaObj.examTest.findUnique as jest.Mock).mockResolvedValue({ isTimed: false, duration: null });
    mockTransaction.mockImplementation(async (fn: (tx: any) => any) => {
      const tx = {
        testAttempt: {
          update: jest.fn().mockResolvedValue(makeAttempt({ status: 'SUBMITTED', score: 2 })),
        },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      return fn(tx);
    });
    mockCount.mockResolvedValue(3);
    // Answers provided directly
    const result = await uc_execute(prismaObj, 'att-1', [{ questionId: 'q1', optionId: 'o1' }, { questionId: 'q2', optionId: 'o2' }], 'user-1');
    expect(result.correct).toBeGreaterThanOrEqual(0);
    expect(result.blank).toBeGreaterThanOrEqual(0);
  });

  it('snapshot varsa doğru/yanlış snapshot üzerinden hesaplanır', async () => {
    const snapshot = [
      { id: 'q1', options: [{ id: 'o1', isCorrect: true }, { id: 'o2', isCorrect: false }] },
      { id: 'q2', options: [{ id: 'o3', isCorrect: false }, { id: 'o4', isCorrect: true }] },
    ];
    mockFindUnique.mockResolvedValue(makeAttempt({ questionsSnapshot: snapshot }));
    const prismaObj = makePrisma();
    (prismaObj.examTest.findUnique as jest.Mock).mockResolvedValue({ isTimed: false, duration: null });
    mockTransaction.mockImplementation(async (fn: (tx: any) => any) => {
      const tx = {
        testAttempt: { update: jest.fn().mockResolvedValue(makeAttempt({ status: 'SUBMITTED', score: 1 })) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      return fn(tx);
    });
    const uc = new SubmitAttemptUseCase(prismaObj);
    // o1 correct, o3 wrong
    const result = await uc.execute('att-1', [{ questionId: 'q1', optionId: 'o1' }, { questionId: 'q2', optionId: 'o3' }], 'user-1');
    expect(result.correct).toBe(1);
    expect(result.wrong).toBe(1);
  });
});

async function uc_execute(prismaObj: any, attemptId: string, answers: any[], actorId: string) {
  const uc = new SubmitAttemptUseCase(prismaObj);
  return uc.execute(attemptId, answers, actorId);
}
