// @ts-nocheck
import { prisma } from '../database/prisma';
import { ITestStatsRepository, TestStatsRow } from '../../domain/interfaces/ITestStatsRepository';

export class PrismaTestStatsRepository implements ITestStatsRepository {
  async findManyByTestIds(testIds: string[]): Promise<TestStatsRow[]> {
    if (!testIds || testIds.length === 0) return [];
    const rows = await prisma.testStats.findMany({ where: { testId: { in: testIds } } as any });
    return rows.map((r) => ({ testId: r.testId, ratingAvg: r.ratingAvg ?? null, ratingCount: r.ratingCount ?? 0, purchaseCount: r.purchaseCount ?? 0 }));
  }
}

