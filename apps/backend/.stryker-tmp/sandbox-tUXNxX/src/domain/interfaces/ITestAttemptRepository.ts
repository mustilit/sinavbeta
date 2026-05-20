// @ts-nocheck
import { TestAttempt } from '../entities/Exam';

export interface ITestAttemptRepository {
  findByTestAndCandidate(testId: string, candidateId: string): Promise<TestAttempt | null>;
  create(attempt: TestAttempt): Promise<TestAttempt>;
}
