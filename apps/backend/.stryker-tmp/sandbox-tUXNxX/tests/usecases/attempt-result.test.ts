// @ts-nocheck
import { GetAttemptResultUseCase } from '../../src/application/use-cases/attempt/GetAttemptResultUseCase';
import { makeAttempt, makeAttemptRepo } from '../helpers/fakes';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('GetAttemptResultUseCase', () => {
  const fakeExamRepo: any = {
    findById: async (id: string) => {
      return { id, title: 'T', questionCount: 3, isTimed: false, hasSolutions: false, questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] };
    },
  };

  const fakeAnswerRepo: any = {
    findByAttemptId: async (attemptId: string) => {
      if (attemptId === 'att-mix') return [{ questionId: 'q1', selectedOptionId: 'o1' }, { questionId: 'q2', selectedOptionId: null }];
      return [];
    },
  };

  it('throws when not owner', async () => {
    const attemptRepo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att1', candidateId: 'other', testId: 't1', status: 'SUBMITTED' }) });
    const uc = new GetAttemptResultUseCase(attemptRepo as any, fakeExamRepo, fakeAnswerRepo);
    await expect(uc.execute('att1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('throws when attempt not finalized', async () => {
    const attemptRepo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att2', candidateId: 'u1', testId: 't1', status: 'IN_PROGRESS' }) });
    const uc = new GetAttemptResultUseCase(attemptRepo as any, fakeExamRepo, fakeAnswerRepo);
    await expect(uc.execute('att2', 'u1')).rejects.toThrow(ConflictException);
  });

  it('computes summary and question analysis', async () => {
    // Arrange: att-mix için q1 cevabı var (o1), q2 null seçenekle var, q3 hiç cevap yok
    // q1: doğru (o1 seçildi, correct=[o1]) → correct=1
    // q2: yanlış (null seçildi → blank sayılır) → blank=1
    // q3: hiç cevap yok → blank=1  ⟹ toplam blank=2, correct=1, wrong=0
    const attemptRepo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att-mix', candidateId: 'u1', testId: 't1', status: 'SUBMITTED' }) });
    const examRepo: any = {
      findById: fakeExamRepo.findById,
      findCorrectOptionIdsByQuestionIds: async (qids: string[]) => ({ q1: ['o1'], q2: ['o2'], q3: ['o3'] }),
    };
    const uc = new GetAttemptResultUseCase(attemptRepo as any, examRepo, fakeAnswerRepo);
    const res = await uc.execute('att-mix', 'u1');
    // 3 soruluk test: q1 doğru, q2 ve q3 blank (null seçenek veya cevap yok)
    expect(res.summary.total).toBe(3);
    expect(res.summary.correct).toBe(1);
    expect(res.summary.blank).toBe(2);
    expect(res.summary.wrong).toBe(0);
    expect(Array.isArray(res.questions)).toBeTruthy();
    const q1 = res.questions.find((q: any) => q.id === 'q1');
    expect(q1.correctOptionIds).toContain('o1');
  });
});

