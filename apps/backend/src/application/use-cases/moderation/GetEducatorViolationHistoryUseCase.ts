import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';

export interface GetEducatorViolationHistoryParams {
  educatorId: string;
  tenantId: string;
  cursor?: { id: string };
  limit?: number;
}

@Injectable()
export class GetEducatorViolationHistoryUseCase {
  constructor(private readonly riskRepo: IEducatorRiskScoreRepository) {}

  async execute(params: GetEducatorViolationHistoryParams) {
    const user = await prisma.user.findUnique({
      where: { id: params.educatorId },
      select: { id: true, username: true, email: true, isBanned: true, suspendedUntil: true },
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    }

    const riskScore = await this.riskRepo.findByUser(params.educatorId, params.tenantId);

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1;
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const violations = await prisma.moderationViolation.findMany({
      where: {
        userId: params.educatorId,
        tenantId: params.tenantId,
        createdAt: { gte: since90 },
      },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        entityType: true,
        entityId: true,
        adminNote: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(params.cursor && {
        cursor: { id: params.cursor.id },
        skip: 1,
      }),
    });

    const hasMore = violations.length > limit;
    const violationItems = hasMore ? violations.slice(0, -1) : violations;

    // Son aksiyonlar (son 5)
    const recentActions = await prisma.moderationAction.findMany({
      where: { userId: params.educatorId, tenantId: params.tenantId },
      select: {
        id: true,
        actionType: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      user,
      riskScore,
      violations: {
        items: violationItems,
        nextCursor:
          hasMore ? { id: violationItems[violationItems.length - 1].id } : null,
      },
      recentActions,
    };
  }
}
