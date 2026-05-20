// @ts-nocheck
import { TestAttempt } from '../../src/domain/entities/Exam';
import { IAttemptRepository } from '../../src/domain/interfaces/IAttemptRepository';

export function makeAttempt(overrides?: Partial<TestAttempt>): TestAttempt {
  return {
    id: 'att1',
    testId: 't1',
    candidateId: 'u1',
    status: 'IN_PROGRESS',
    score: null,
    startedAt: new Date(),
    completedAt: null,
    submittedAt: null,
    ...overrides,
  };
}

export function makeAttemptRepo(overrides?: {
  findAttemptById?: (id: string) => Promise<TestAttempt | null>;
}): IAttemptRepository {
  return {
    countSubmittedByTest: async () => {
      throw new Error('not implemented');
    },
    groupScoresByTest: async () => {
      throw new Error('not implemented');
    },
    findLatestSubmittedAttempt: async () => {
      throw new Error('not implemented');
    },
    findAttemptById: overrides?.findAttemptById ?? (async () => makeAttempt()),
    hasSubmittedAttempt: async () => {
      throw new Error('not implemented');
    },
    hasAnyAttempt: async () => false,
    hasAnswersForQuestion: async () => false,
    hasAnswersForOption: async () => false,
    markTimeout: async () => {
      throw new Error('not implemented');
    },
  } as unknown as IAttemptRepository;
}

