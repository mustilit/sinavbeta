// @ts-nocheck
import { SubmitAnswerUseCase } from '../../src/application/use-cases/attempt/SubmitAnswerUseCase';
import { makeAttempt } from '../helpers/fakes';

// Süreli olmayan attempt: remainingSec büyük bir değer, lastResumedAt çok yakın
function makeTimedAttempt(overrides?: object) {
  return {
    ...makeAttempt({ id: 'att1', candidateId: 'u1', testId: 't1', status: 'IN_PROGRESS' }),
    remainingSec: 9999,
    lastResumedAt: new Date(),
    ...overrides,
  };
}

describe('SubmitAnswerUseCase', () => {
  it('creates attempt answer when not existing', async () => {
    // Arrange
    const upserted = { id: 'aa1', attemptId: 'att1', questionId: 'q1', selectedOptionId: 'o1', isCorrect: true };
    const fakePrisma: any = {
      testAttempt: {
        findUnique: async () => makeTimedAttempt(),
        update: async (opts: any) => ({ ...makeTimedAttempt(), ...opts.data }),
      },
      examQuestion: { findUnique: async () => ({ id: 'q1', testId: 't1' }) },
      examOption: { findUnique: async () => ({ id: 'o1', questionId: 'q1', isCorrect: true }) },
      attemptAnswer: { upsert: async (opts: any) => ({ ...upserted, ...opts.create }) },
      auditLog: { create: async () => ({}) },
      $transaction: async (ops: any[]) => {
        // $transaction dizisi içindeki promise'leri çözümle
        return Promise.all(ops);
      },
    };
    const uc = new SubmitAnswerUseCase(fakePrisma);
    // Act
    const res = await uc.execute('att1', 'q1', 'o1', 'u1');
    // Assert
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  it('updates attempt answer when exists', async () => {
    // Arrange
    const fakePrisma2: any = {
      testAttempt: {
        findUnique: async () => makeTimedAttempt(),
        update: async (opts: any) => ({ ...makeTimedAttempt(), ...opts.data }),
      },
      examQuestion: { findUnique: async () => ({ id: 'q1', testId: 't1' }) },
      examOption: { findUnique: async () => ({ id: 'o2', questionId: 'q1', isCorrect: false }) },
      attemptAnswer: { upsert: async (opts: any) => ({ id: 'aa1', ...opts.update }) },
      auditLog: { create: async () => ({}) },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    const uc2 = new SubmitAnswerUseCase(fakePrisma2);
    // Act
    const res2 = await uc2.execute('att1', 'q1', 'o2', 'u1');
    // Assert
    expect(res2).toBeDefined();
    expect(res2.id).toEqual('aa1');
  });

  it('rejects when option does not belong to question', async () => {
    // Arrange: seçenek farklı soruya ait
    const fakePrisma3: any = {
      testAttempt: {
        findUnique: async () => makeTimedAttempt(),
        update: async (opts: any) => opts,
      },
      examQuestion: { findUnique: async () => ({ id: 'q1', testId: 't1' }) },
      examOption: { findUnique: async () => ({ id: 'oX', questionId: 'q-other', isCorrect: false }) },
      attemptAnswer: { upsert: async (opts: any) => ({ id: 'aaX', ...opts.create }) },
      auditLog: { create: async () => ({}) },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    const uc3 = new SubmitAnswerUseCase(fakePrisma3);
    // Act & Assert
    await expect(uc3.execute('att1', 'q1', 'oX', 'u1')).rejects.toThrow();
  });

  it('deletes existing answer when optionId missing', async () => {
    // Arrange: optionId verilmediğinde mevcut cevap silinmeli
    const fakePrisma4: any = {
      testAttempt: {
        findUnique: async () => makeTimedAttempt(),
        update: async (opts: any) => opts,
      },
      examQuestion: { findUnique: async () => ({ id: 'q1', testId: 't1' }) },
      attemptAnswer: { deleteMany: async () => ({ count: 1 }) },
      auditLog: { create: async () => ({}) },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    const uc4 = new SubmitAnswerUseCase(fakePrisma4);
    // Act
    const res4 = await uc4.execute('att1', 'q1', undefined, 'u1');
    // Assert
    expect(res4).toBeDefined();
    expect(res4.count).toBeGreaterThanOrEqual(0);
  });
});

