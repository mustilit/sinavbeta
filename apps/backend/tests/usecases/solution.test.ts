import { GetQuestionSolutionUseCase } from '../../src/application/use-cases/question/GetQuestionSolutionUseCase';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { makeAttempt, makeAttemptRepo } from '../helpers/fakes';

describe('GetQuestionSolutionUseCase', () => {
  const fakeExamRepo: any = {
    findById: async (id: string) => {
      if (id === 'test-no-solutions') return { id: 'test-no-solutions', hasSolutions: false, questions: [{ id: 'q1', solutionText: 's1', solutionMediaUrl: null }] };
      if (id === 'test-with-solutions') return { id: 'test-with-solutions', hasSolutions: true, questions: [{ id: 'q1', solutionText: 's1', solutionMediaUrl: 'url' }] };
      return null;
    },
  };

  it('throws when not owner', async () => {
    // Arrange: attempt sahibi 'other', aktör 'u1'
    const repo = makeAttemptRepo({
      findAttemptById: async () => makeAttempt({ id: 'att-not-owner', candidateId: 'other', testId: 'test-with-solutions', status: 'SUBMITTED' }),
    });
    const uc = new GetQuestionSolutionUseCase(repo, fakeExamRepo);
    // Act & Assert
    await expect(uc.execute('att-not-owner', 'q1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('allows IN_PROGRESS attempts (çözümlü/çalışma modu)', async () => {
    // Arrange: hasSolutions=true testlerde IN_PROGRESS sırasında da çözüm açılır
    // (commit e56fcff sonrası davranış). Eski sürümde ConflictException atılıyordu.
    const repo = makeAttemptRepo({
      findAttemptById: async () => makeAttempt({ id: 'att-in-progress', candidateId: 'u1', testId: 'test-with-solutions', status: 'IN_PROGRESS' }),
    });
    const uc = new GetQuestionSolutionUseCase(repo, fakeExamRepo);
    // Act
    const res = await uc.execute('att-in-progress', 'q1', 'u1');
    // Assert
    expect(res).toHaveProperty('questionId', 'q1');
    expect(res).toHaveProperty('solutionText', 's1');
  });

  it('throws when solutions disabled', async () => {
    // Arrange: test hasSolutions=false
    const repo = makeAttemptRepo({
      findAttemptById: async () => makeAttempt({ id: 'att-test-no-solutions', candidateId: 'u1', testId: 'test-no-solutions', status: 'SUBMITTED' }),
    });
    const uc = new GetQuestionSolutionUseCase(repo, fakeExamRepo);
    // Act & Assert
    await expect(uc.execute('att-test-no-solutions', 'q1', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('returns solution when ok', async () => {
    // Arrange: geçerli SUBMITTED attempt, hasSolutions=true
    const repo = makeAttemptRepo({
      findAttemptById: async () => makeAttempt({ id: 'att1', candidateId: 'u1', testId: 'test-with-solutions', status: 'SUBMITTED' }),
    });
    const uc = new GetQuestionSolutionUseCase(repo, fakeExamRepo);
    // Act
    const res = await uc.execute('att1', 'q1', 'u1');
    // Assert
    expect(res).toHaveProperty('questionId', 'q1');
    expect(res).toHaveProperty('solutionText', 's1');
    expect(res).toHaveProperty('solutionMediaUrl', 'url');
  });

  it('allows TIMEOUT attempts to read solutions', async () => {
    // Arrange: TIMEOUT durumundaki attempt de çözüm okuyabilmeli
    const repo = makeAttemptRepo({ findAttemptById: async () => makeAttempt({ id: 'att-timeout', candidateId: 'u1', testId: 'test-with-solutions', status: 'TIMEOUT' }) });
    const uc = new GetQuestionSolutionUseCase(repo, fakeExamRepo);
    // Act & Assert
    const res = await uc.execute('att-timeout', 'q1', 'u1');
    expect(res).toHaveProperty('questionId', 'q1');
  });
});

