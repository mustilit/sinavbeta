// @ts-nocheck
import { makeAttempt, makeAttemptRepo } from '../helpers/fakes';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TimeoutAttemptUseCase } from '../../src/application/use-cases/attempt/TimeoutAttemptUseCase';

describe('TimeoutAttemptUseCase', () => {
  it('throws if not owner', async () => {
    const attemptRepo = makeAttemptRepo({
      findAttemptById: async () => makeAttempt({ id: 'att1', candidateId: 'other', testId: 't1', status: 'IN_PROGRESS' }),
    });
    const examRepo: any = {
      findById: async () => ({ id: 't1', isTimed: true, duration: 1, questionCount: 1, questions: [{ id: 'q1' }] }),
    };
    const answerRepo: any = {
      findByAttemptIdWithOptionCorrectness: async () => [],
    };
    const auditRepo: any = { create: async () => ({}) };
    const uc = new TimeoutAttemptUseCase(attemptRepo as any, examRepo, answerRepo, auditRepo);
    await expect(uc.execute('att1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('is idempotent when already timed out', async () => {
    const existing = makeAttempt({ id: 'att1', candidateId: 'u1', testId: 't1', status: 'TIMEOUT' });
    const attemptRepo = makeAttemptRepo({
      findAttemptById: async () => existing,
    } as any);
    const examRepo: any = { findById: async () => ({ id: 't1', isTimed: true, duration: 1, questionCount: 1, questions: [{ id: 'q1' }] }) };
    const answerRepo: any = { findByAttemptIdWithOptionCorrectness: async () => [] };
    const uc = new TimeoutAttemptUseCase(attemptRepo as any, examRepo, answerRepo, undefined);
    await expect(uc.execute('att1', 'u1')).resolves.toEqual(existing);
  });
});

