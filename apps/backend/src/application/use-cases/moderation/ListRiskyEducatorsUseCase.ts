import { Injectable } from '@nestjs/common';
import { EducatorRiskLevel } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

export interface ListRiskyEducatorsParams {
  tenantId: string;
  cursor?: { computedScore: number; userId: string };
  limit?: number;
  riskLevels?: EducatorRiskLevel[];
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class ListRiskyEducatorsUseCase {
  async execute(params: ListRiskyEducatorsParams) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1;

    // Cursor pagination: computedScore DESC + userId ASC tie-breaker
    const rows = await prisma.educatorRiskScore.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.riskLevels?.length && { riskLevel: { in: params.riskLevels } }),
        ...(params.dateFrom || params.dateTo
          ? {
              lastViolationAt: {
                ...(params.dateFrom && { gte: params.dateFrom }),
                ...(params.dateTo && { lte: params.dateTo }),
              },
            }
          : {}),
        ...(params.cursor && {
          OR: [
            { computedScore: { lt: params.cursor.computedScore } },
            {
              computedScore: params.cursor.computedScore,
              userId: { gt: params.cursor.userId },
            },
          ],
        }),
      },
      select: {
        id: true,
        userId: true,
        riskLevel: true,
        computedScore: true,
        violationCount: true,
        openViolations: true,
        highSeverityCount: true,
        lastViolationAt: true,
        lastComputedAt: true,
      },
      orderBy: [{ computedScore: 'desc' }, { userId: 'asc' }],
      take,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;

    // User join — username + email
    const userIds = items.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, email: true, suspendedUntil: true, isBanned: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = items.map((r) => ({
      ...r,
      user: userMap.get(r.userId) ?? null,
    }));

    const last = items[items.length - 1];
    return {
      items: enriched,
      nextCursor:
        hasMore && last
          ? { computedScore: last.computedScore, userId: last.userId }
          : null,
    };
  }
}
