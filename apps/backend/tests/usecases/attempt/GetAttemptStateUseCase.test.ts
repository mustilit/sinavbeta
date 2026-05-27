/**
 * GetAttemptStateUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - attemptId/candidateId eksik → BadRequest
 * - Attempt bulunamazsa → ATTEMPT_NOT_FOUND
 * - Başka kullanıcının attempt'i → NOT_ATTEMPT_OWNER
 * - Test bulunamazsa → TEST_NOT_FOUND
 * - IN_PROGRESS: isCorrect sızdırılmaz
 * - Submit sonrası: isCorrect açılır
 * - Süreli test: remainingSeconds, endsAt döner
 * - Bitirilmiş attempt: remainingSeconds = 0
 * - hasSolutions=true: aktif sırasında da solution gösterilir
 * - questionsSnapshot varsa canlı soru yerine snapshot kullanılır
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GetAttemptStateUseCase } from '../../../src/application/use-cases/attempt/GetAttemptStateUseCase';

function makeAttemptRepo(attempt: any) {
  return { findAttemptById: jest.fn().mockResolvedValue(attempt) };
}

function makeExamRepo(test: any) {
  return { findById: jest.fn().mockResolvedValue(test) };
}

function makeAnswerRepo(answers: any[] = []) {
  return { findByAttemptId: jest.fn().mockResolvedValue(answers) };
}

function makeAttempt(overrides: Record<string, any> = {}) {
  return {
    id: 'att-1',
    testId: 'test-1',
    candidateId: 'u1',
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    submittedAt: null,
    questionsSnapshot: null,
    ...overrides,
  };
}

function makeTest(overrides: Record<string, any> = {}) {
  return {
    id: 'test-1',
    title: 'Test Adı',
    isTimed: false,
    hasSolutions: false,
    duration: null,
    questionCount: 2,
    questions: [
      { id: 'q1', content: 'Soru 1', mediaUrl: null, order: 1, options: [{ id: 'o1', content: 'A', isCorrect: true, mediaUrl: null }] },
      { id: 'q2', content: 'Soru 2', mediaUrl: null, order: 2, options: [{ id: 'o2', content: 'B', isCorrect: false, mediaUrl: null }] },
    ],
    ...overrides,
  };
}

describe('GetAttemptStateUseCase', () => {
  it('attemptId eksik ise BadRequestException fırlatır', async () => {
    const uc = new GetAttemptStateUseCase(makeAttemptRepo(null) as any, makeExamRepo(null) as any, makeAnswerRepo() as any);
    await expect(uc.execute('', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('candidateId eksik ise BadRequestException fırlatır', async () => {
    const uc = new GetAttemptStateUseCase(makeAttemptRepo(null) as any, makeExamRepo(null) as any, makeAnswerRepo() as any);
    await expect(uc.execute('att-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attempt bulunamazsa ATTEMPT_NOT_FOUND BadRequest fırlatır', async () => {
    const uc = new GetAttemptStateUseCase(makeAttemptRepo(null) as any, makeExamRepo(makeTest()) as any, makeAnswerRepo() as any);
    await expect(uc.execute('att-missing', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ATTEMPT_NOT_FOUND' }),
    });
  });

  it('başka kullanıcı attempt i → NOT_ATTEMPT_OWNER ForbiddenException fırlatır', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ candidateId: 'other-user' })) as any,
      makeExamRepo(makeTest()) as any,
      makeAnswerRepo() as any,
    );
    await expect(uc.execute('att-1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('test bulunamazsa TEST_NOT_FOUND BadRequest fırlatır', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt()) as any,
      makeExamRepo(null) as any,
      makeAnswerRepo() as any,
    );
    await expect(uc.execute('att-1', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEST_NOT_FOUND' }),
    });
  });

  it('IN_PROGRESS sırasında isCorrect sızdırılmaz', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ status: 'IN_PROGRESS' })) as any,
      makeExamRepo(makeTest()) as any,
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    for (const q of result.questions) {
      for (const o of q.options) {
        expect(o).not.toHaveProperty('isCorrect');
      }
    }
  });

  it('SUBMITTED sonrası isCorrect açılır', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ status: 'SUBMITTED', submittedAt: new Date() })) as any,
      makeExamRepo(makeTest()) as any,
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    for (const q of result.questions) {
      for (const o of q.options) {
        expect(o).toHaveProperty('isCorrect');
      }
    }
  });

  it('süreli test: remainingSeconds ve endsAt döner', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ startedAt: new Date(Date.now() - 60_000) })) as any,
      makeExamRepo(makeTest({ isTimed: true, duration: 30 })) as any, // 30 dakika
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    expect(result.attempt.remainingSeconds).toBeGreaterThan(0);
    expect(result.attempt.endsAt).toBeDefined();
    expect(result.attempt.durationMinutes).toBe(30);
  });

  it('bitirilmiş attempt te remainingSeconds = 0', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ status: 'SUBMITTED', submittedAt: new Date() })) as any,
      makeExamRepo(makeTest({ isTimed: true, duration: 30 })) as any,
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    expect(result.attempt.remainingSeconds).toBe(0);
  });

  it('hasSolutions=true: IN_PROGRESS sırasında solutionText açılır', async () => {
    const testWithSolutions = makeTest({
      hasSolutions: true,
      questions: [
        { id: 'q1', content: 'Soru 1', mediaUrl: null, order: 1, solutionText: 'Çözüm A', solutionMediaUrl: null, options: [] },
      ],
    });
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ status: 'IN_PROGRESS' })) as any,
      makeExamRepo(testWithSolutions) as any,
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    expect(result.questions[0]).toHaveProperty('solutionText', 'Çözüm A');
  });

  it('questionsSnapshot varsa canlı soruları değil snapshot kullanır', async () => {
    const snapshot = [
      { id: 'snap-q1', content: 'Snapshot Soru', mediaUrl: null, order: 1, options: [] },
    ];
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt({ questionsSnapshot: snapshot })) as any,
      makeExamRepo(makeTest()) as any,
      makeAnswerRepo() as any,
    );
    const result = await uc.execute('att-1', 'u1');
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBe('snap-q1');
  });

  it('cevap verilen sorunun selectedOptionId döner', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt()) as any,
      makeExamRepo(makeTest()) as any,
      makeAnswerRepo([{ questionId: 'q1', selectedOptionId: 'o1' }]) as any,
    );
    const result = await uc.execute('att-1', 'u1');
    const q1 = result.questions.find((q: any) => q.id === 'q1');
    expect(q1.selectedOptionId).toBe('o1');
    expect(q1.answered).toBe(true);
  });

  it('summary: answeredCount ve blankCount doğru hesaplanır', async () => {
    const uc = new GetAttemptStateUseCase(
      makeAttemptRepo(makeAttempt()) as any,
      makeExamRepo(makeTest()) as any, // 2 soru
      makeAnswerRepo([{ questionId: 'q1', selectedOptionId: 'o1' }]) as any, // 1 cevaplı
    );
    const result = await uc.execute('att-1', 'u1');
    expect(result.summary.answeredCount).toBe(1);
    expect(result.summary.blankCount).toBe(1);
  });
});
