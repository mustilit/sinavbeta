import { TestAttempt } from '../../domain/entities/Exam';
import { ITestAttemptRepository } from '../../domain/interfaces/ITestAttemptRepository';
import { prisma } from '../database/prisma';

/**
 * Prisma Test Attempt Repository
 */
export class PrismaTestAttemptRepository implements ITestAttemptRepository {
  async findByTestAndCandidate(testId: string, candidateId: string): Promise<TestAttempt | null> {
    // Çok-denemeli: en son denemeyi döndür (attemptNumber desc).
    const attempt = await prisma.testAttempt.findFirst({
      where: { testId, candidateId },
      orderBy: { attemptNumber: 'desc' } as any,
    });
    return attempt ? this.toDomain(attempt) : null;
  }

  async create(attempt: TestAttempt): Promise<TestAttempt> {
    const created = await prisma.testAttempt.create({
      data: {
        id: attempt.id,
        testId: attempt.testId,
        candidateId: attempt.candidateId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
      },
    });
    return this.toDomain(created);
  }

  private toDomain(row: {
    id: string;
    testId: string;
    candidateId: string;
    startedAt: Date;
    completedAt: Date | null;
    status?: string;
  }): TestAttempt {
    return {
      id: row.id,
      testId: row.testId,
      candidateId: row.candidateId,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: (row.status as TestAttempt['status']) ?? 'IN_PROGRESS',
    };
  }
}
