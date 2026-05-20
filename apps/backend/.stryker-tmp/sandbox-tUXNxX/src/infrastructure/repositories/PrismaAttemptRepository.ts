// @ts-nocheck
import { prisma } from '../database/prisma';
import { IAttemptRepository, ScoreCount } from '../../domain/interfaces/IAttemptRepository';
import { TestAttempt } from '../../domain/entities/Exam';

export class PrismaAttemptRepository implements IAttemptRepository {
  async countSubmittedByTest(testId: string): Promise<number> {
    return prisma.testAttempt.count({ where: { testId, status: 'SUBMITTED', score: { not: null } as any } as any });
  }

  async groupScoresByTest(testId: string): Promise<ScoreCount[]> {
    const rows: any[] = await prisma.testAttempt.groupBy({
      by: ['score'],
      where: { testId, status: 'SUBMITTED', score: { not: null } as any } as any,
      _count: { score: true },
    } as any);
    return rows.map((r) => ({ score: r.score ?? 0, count: r._count.score }));
  }

  async findLatestSubmittedAttempt(testId: string, candidateId: string): Promise<{ id: string; score: number } | null> {
    const row = await prisma.testAttempt.findFirst({
      where: { testId, candidateId, status: 'SUBMITTED' },
      orderBy: { completedAt: 'desc' },
    });
    if (!row) return null;
    return { id: row.id, score: row.score ?? 0 };
  }

  async findAttemptById(attemptId: string): Promise<TestAttempt | null> {
    // questionsSnapshot, prisma generate sonrası type'a eklenecek; şimdilik any cast
    const row: any = await (prisma.testAttempt as any).findUnique({
      where: { id: attemptId },
      select: { id: true, candidateId: true, testId: true, status: true, score: true, startedAt: true, completedAt: true, submittedAt: true, questionsSnapshot: true, metadata: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      testId: row.testId,
      candidateId: row.candidateId,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: row.status ?? 'IN_PROGRESS',
      score: row.score ?? null,
      submittedAt: row.submittedAt ?? null,
      questionsSnapshot: row.questionsSnapshot ?? null,
      metadata: (row as any).metadata ?? null,
    };
  }

  async hasSubmittedAttempt(testId: string, candidateId: string): Promise<boolean> {
    const c = await prisma.testAttempt.count({ where: { testId, candidateId, status: 'SUBMITTED', score: { not: null } as any } as any });
    return c > 0;
  }

  async hasAnyAttempt(testId: string, candidateId: string): Promise<boolean> {
    const c = await prisma.testAttempt.count({ where: { testId, candidateId } });
    return c > 0;
  }

  async hasAnswersForQuestion(questionId: string): Promise<boolean> {
    const c = await prisma.attemptAnswer.count({ where: { questionId } });
    return c > 0;
  }

  async hasAnswersForOption(optionId: string): Promise<boolean> {
    const c = await prisma.attemptAnswer.count({ where: { selectedOptionId: optionId } });
    return c > 0;
  }

  async markTimeout(attemptId: string, data: { score: number; submittedAt: Date; completedAt: Date }): Promise<TestAttempt> {
    const row = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: { status: 'TIMEOUT', score: data.score, submittedAt: data.submittedAt, completedAt: data.completedAt },
    });
    return {
      id: row.id,
      testId: row.testId,
      candidateId: row.candidateId,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: (row.status as any) ?? 'TIMEOUT',
      score: row.score ?? null,
      submittedAt: row.submittedAt ?? null,
    };
  }
}

