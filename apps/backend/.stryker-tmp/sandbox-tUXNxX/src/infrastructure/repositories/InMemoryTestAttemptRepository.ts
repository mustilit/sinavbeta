// @ts-nocheck
import { TestAttempt } from '../../domain/entities/Exam';
import { ITestAttemptRepository } from '../../domain/interfaces/ITestAttemptRepository';

/**
 * In-memory Test Attempt Repository - geliştirme/test
 */
export class InMemoryTestAttemptRepository implements ITestAttemptRepository {
  private attempts: Map<string, TestAttempt> = new Map();

  private key(testId: string, candidateId: string): string {
    return `${testId}:${candidateId}`;
  }

  async findByTestAndCandidate(testId: string, candidateId: string): Promise<TestAttempt | null> {
    return this.attempts.get(this.key(testId, candidateId)) ?? null;
  }

  async create(attempt: TestAttempt): Promise<TestAttempt> {
    this.attempts.set(this.key(attempt.testId, attempt.candidateId), attempt);
    return attempt;
  }
}
