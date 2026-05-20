// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { ReviewAggregationService } from '../../application/services/ReviewAggregationService';

export async function processTestStatsRefresh(prisma: PrismaClient, testId: string) {
  if (!testId) throw new Error('missing testId');
  const reviewAgg = new ReviewAggregationService();
  const agg = await reviewAgg.getAggregatesForTestIds([testId]);
  const ratingAvg = agg[testId]?.avg ?? null;
  const ratingCount = agg[testId]?.count ?? 0;
  const purchaseCount = await prisma.purchase.count({ where: { testId } });
  const upserted = await prisma.testStats.upsert({
    where: { testId },
    update: { ratingAvg, ratingCount, purchaseCount },
    create: { testId, ratingAvg, ratingCount, purchaseCount },
  });
  return { ratingAvg, ratingCount, purchaseCount, upserted };
}

