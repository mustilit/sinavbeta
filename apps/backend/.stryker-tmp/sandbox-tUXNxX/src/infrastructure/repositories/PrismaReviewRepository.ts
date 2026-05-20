// @ts-nocheck
import { prisma } from '../database/prisma';
import { IReviewRepository, ReviewRecord } from '../../domain/interfaces/IReviewRepository';

export class PrismaReviewRepository implements IReviewRepository {
  async upsertReview(input: { testId: string; educatorId: string; candidateId: string; testRating?: number; educatorRating?: number; comment?: string }): Promise<ReviewRecord> {
    const existing = await prisma.review.findUnique({
      where: { testId_candidateId: { testId: input.testId, candidateId: input.candidateId } } as any,
    });
    const resolvedTestRating = input.testRating ?? existing?.testRating ?? 1;
    const created = await prisma.review.upsert({
      where: { testId_candidateId: { testId: input.testId, candidateId: input.candidateId } } as any,
      update: {
        ...(input.testRating !== undefined && { testRating: input.testRating }),
        ...(input.educatorRating !== undefined && { educatorRating: input.educatorRating }),
        ...(input.comment !== undefined && { comment: input.comment }),
        educatorId: input.educatorId,
        updatedAt: new Date(),
      },
      create: {
        testId: input.testId,
        educatorId: input.educatorId,
        candidateId: input.candidateId,
        testRating: resolvedTestRating,
        educatorRating: input.educatorRating ?? null,
        comment: input.comment ?? null,
      },
    });
    return this.toDomain(created);
  }

  async listReviewsForTest(testId: string, limit = 20, cursor?: string): Promise<{ items: ReviewRecord[]; nextCursor?: string }> {
    const take = Math.min(50, Math.max(1, limit || 20));
    const findOpts: any = {
      where: { testId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    };
    if (cursor) {
      findOpts.cursor = { id: cursor };
      findOpts.skip = 1;
    }
    const rows = await prisma.review.findMany(findOpts);
    const items = rows.map(this.toDomain);
    const nextCursor = items.length === take ? items[items.length - 1].id : undefined;
    return { items, nextCursor };
  }

  async getAggregateForTest(testId: string): Promise<{ avg: number | null; count: number }> {
    const rows: any = await prisma.review.aggregate({
      _avg: { testRating: true },
      _count: { _all: true },
      where: { testId },
    } as any);
    return { avg: rows._avg.testRating ?? null, count: rows._count._all ?? 0 };
  }

  async getAggregateForEducator(educatorId: string): Promise<{ avg: number | null; count: number }> {
    const rows: any = await prisma.review.aggregate({
      _avg: { educatorRating: true },
      _count: { _all: true },
      where: { educatorId },
    } as any);
    return { avg: rows._avg.educatorRating ?? null, count: rows._count._all ?? 0 };
  }

  private toDomain(row: any): ReviewRecord {
    return {
      id: row.id,
      testId: row.testId,
      educatorId: row.educatorId,
      candidateId: row.candidateId,
      testRating: row.testRating,
      educatorRating: row.educatorRating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

