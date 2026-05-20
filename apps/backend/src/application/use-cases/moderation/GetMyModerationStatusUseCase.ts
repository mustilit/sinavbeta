import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';

@Injectable()
export class GetMyModerationStatusUseCase {
  constructor(private readonly riskRepo: IEducatorRiskScoreRepository) {}

  async execute(userId: string, tenantId: string) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [riskScore, recentViolations, activeActionRecord, user] = await Promise.all([
      this.riskRepo.findByUser(userId, tenantId),

      prisma.moderationViolation.findMany({
        where: {
          userId,
          tenantId,
          createdAt: { gte: since30 },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          category: true,
          severity: true,
          status: true,
          createdAt: true,
          entityType: true,
        },
      }),

      prisma.moderationAction.findFirst({
        where: {
          userId,
          tenantId,
          actionType: { in: ['ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'WARN'] },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          actionType: true,
          reason: true,
          expiresAt: true,
        },
      }),

      prisma.user.findUnique({
        where: { id: userId },
        select: { isBanned: true, suspendedUntil: true },
      }),
    ]);

    return {
      riskScore: riskScore
        ? {
            riskLevel: riskScore.riskLevel,
            computedScore: riskScore.computedScore,
            violationCount: riskScore.violationCount,
            openViolations: riskScore.openViolations,
            highSeverityCount: riskScore.highSeverityCount,
            lastViolationAt: riskScore.lastViolationAt,
          }
        : null,
      recentViolations,
      activeAction: activeActionRecord ?? null,
      suspendedUntil: user?.suspendedUntil ?? null,
      isBanned: user?.isBanned ?? false,
    };
  }
}
