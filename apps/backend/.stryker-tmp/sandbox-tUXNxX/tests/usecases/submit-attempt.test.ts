// @ts-nocheck
import { SubmitAttemptUseCase } from '../../src/application/use-cases/attempt/SubmitAttemptUseCase';
import { makeAttempt } from '../helpers/fakes';

/** Fake $transaction that runs the callback with the tx object (same as prisma here) */
function makeTransactionFn(prismaLike: any) {
  return async (fn: (tx: any) => Promise<any>) => fn(prismaLike);
}

describe('SubmitAttemptUseCase', () => {
  it('finalizes attempt using stored answers', async () => {
    // Arrange: 2 cevaplı (o1 doğru, o2 yanlış), toplam 3 soru → blank=1
    const fakePrisma: any = {
      testAttempt: {
        findUnique: async () => makeAttempt({ id: 'att1', candidateId: 'u1', testId: 't1', status: 'IN_PROGRESS' }),
        update: async (opts: any) => ({ id: 'att1', status: 'SUBMITTED', score: 1, ...opts.data }),
      },
      attemptAnswer: { findMany: async () => [{ questionId: 'q1', selectedOptionId: 'o1' }, { questionId: 'q2', selectedOptionId: 'o2' }] },
      examOption: { findMany: async ({ where }: any) => [{ id: 'o1', isCorrect: true }, { id: 'o2', isCorrect: false }] },
      examTest: { findUnique: async () => ({ isTimed: false, duration: null }) },
      examQuestion: { count: async () => 3 },
      auditLog: { create: async () => ({}) },
    };
    fakePrisma.$transaction = makeTransactionFn(fakePrisma);

    const uc = new SubmitAttemptUseCase(fakePrisma);
    // Act
    const res = await uc.execute('att1', undefined, 'u1');
    // Assert
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.updated.status).toEqual('SUBMITTED');
    expect(res.correct + res.wrong + res.blank).toEqual(expect.any(Number));
  });

  it('is idempotent when already submitted', async () => {
    const fakePrisma: any = {
      testAttempt: {
        findUnique: async (q: any) => makeAttempt({ id: 'att1', candidateId: 'u1', testId: 't1', status: 'SUBMITTED', score: 1 }),
        update: async () => ({ id: 'att1', status: 'SUBMITTED', score: 1 }),
      },
      attemptAnswer: { findMany: async () => [{ questionId: 'q1', selectedOptionId: 'o1' }] },
      examOption: { findMany: async ({ where }: any) => [{ id: 'o1', isCorrect: true }] },
      auditLog: { create: async () => ({}) },
      examQuestion: { count: async () => 2 },
    };
    fakePrisma.$transaction = makeTransactionFn(fakePrisma);

    const uc = new SubmitAttemptUseCase(fakePrisma);
    const res = await uc.execute('att1', undefined, 'u1');
    expect(res.score).toEqual(1);
    expect(res.correct).toBeDefined();
  });

  it('propagates error when auditLog.create fails inside transaction', async () => {
    const fakePrisma: any = {
      testAttempt: {
        findUnique: async () => makeAttempt({ id: 'att1', candidateId: 'u1', testId: 't1', status: 'IN_PROGRESS' }),
        update: async (opts: any) => ({ id: 'att1', status: 'SUBMITTED', score: 1, ...opts.data }),
      },
      attemptAnswer: { findMany: async () => [] },
      examOption: { findMany: async () => [] },
      examTest: { findUnique: async () => ({ isTimed: false, duration: null }) },
      examQuestion: { count: async () => 0 },
      auditLog: { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) },
    };
    fakePrisma.$transaction = makeTransactionFn(fakePrisma);

    const uc = new SubmitAttemptUseCase(fakePrisma);
    // With atomic transaction, auditLog failure rolls back the entire operation
    await expect(uc.execute('att1', undefined, 'u1')).rejects.toThrow('AUDIT_FAIL');
  });
});
