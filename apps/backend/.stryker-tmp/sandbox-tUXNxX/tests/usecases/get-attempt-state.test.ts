// @ts-nocheck
import { GetAttemptStateUseCase } from '../../src/application/use-cases/attempt/GetAttemptStateUseCase';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { makeAttempt, makeAttemptRepo } from '../helpers/fakes';

describe('GetAttemptStateUseCase', () => {
  const fakeExamRepo: any = {
    findById: async (id: string) => {
      if (id === 't-no-questions') return { id, title: 'T1', questionCount: 0, isTimed: false, hasSolutions: false, questions: [] };
      if (id === 't-timed') return { id, title: 'Timed Test', questionCount: 2, isTimed: true, duration: 1, hasSolutions: false, questions: [{ id: 'q1' }, { id: 'q2' }] };
      return { id, title: 'T', questionCount: 2, isTimed: false, duration: null, hasSolutions: true, questions: [{ id: 'q1' }, { id: 'q2' }] };
    },
  };

  const fakeAnswerRepo: any = {
    findByAttemptId: async (attemptId: string) => {
      if (attemptId === 'att-with-answers') return [{ questionId: 'q1', selectedOptionId: 'o1' }];
      return [];
    },
  };

  it('throws when not owner', async () => {
    const repo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att1', candidateId: 'other', testId: 't1', status: 'IN_PROGRESS' }) });
    const uc = new GetAttemptStateUseCase(repo, fakeExamRepo, fakeAnswerRepo);
    await expect(uc.execute('att1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('maps answered and blank counts correctly', async () => {
    const repo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att-with-answers', candidateId: 'u1', testId: 't', status: 'IN_PROGRESS' }) });
    const uc = new GetAttemptStateUseCase(repo, fakeExamRepo, fakeAnswerRepo);
    const res = await uc.execute('att-with-answers', 'u1');
    expect(res.questions.length).toBe(2);
    expect(res.summary.answeredCount).toBe(1);
    expect(res.summary.blankCount).toBe(1);
  });

  it('computes remainingSeconds for timed test', async () => {
    const startedAt = new Date(Date.now() - 30 * 1000); // started 30s ago
    const repo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att-timed', candidateId: 'u1', testId: 't-timed', status: 'IN_PROGRESS', startedAt }) });
    const uc = new GetAttemptStateUseCase(repo, fakeExamRepo, fakeAnswerRepo);
    const res = await uc.execute('att-timed', 'u1');
    expect(res.attempt.remainingSeconds).toBeGreaterThanOrEqual(0);
    expect(res.test.isTimed).toBeTruthy();
  });
});

