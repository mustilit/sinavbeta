// @ts-nocheck
import { randomUUID } from 'crypto';
import { TestAttempt } from '../../domain/entities/Exam';
import { ITestAttemptRepository } from '../../domain/interfaces/ITestAttemptRepository';

/**
 * TestAttemptService
 * İş kuralları Controller'da değil Service katmanında uygulanır.
 */
export class TestAttemptService {
  constructor(private readonly attemptRepository: ITestAttemptRepository) {}

  /**
   * Aday test başlatma - aynı aday aynı testi tekrar alamaz
   */
  async startTest(testId: string, candidateId: string): Promise<TestAttempt> {
    // Aynı aday aynı testi tekrar alamaz
    const existing = await this.attemptRepository.findByTestAndCandidate(testId, candidateId);
    if (existing) {
      throw new Error(
        'DUPLICATE_ATTEMPT: Aynı aday aynı testi tekrar alamaz.'
      );
    }

    const attempt: TestAttempt = {
      id: randomUUID(),
      testId,
      candidateId,
      startedAt: new Date(),
      completedAt: null,
      status: 'IN_PROGRESS',
    };

    return this.attemptRepository.create(attempt);
  }
}
