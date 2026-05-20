import { Injectable } from '@nestjs/common';
import { EducatorRiskLevel } from '@prisma/client';
import { prisma } from '../database/prisma';
import {
  EducatorRiskScoreRecord,
  IEducatorRiskScoreRepository,
  UpsertRiskScoreData,
} from '../../domain/interfaces/IEducatorRiskScoreRepository';

const RISK_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  riskLevel: true,
  computedScore: true,
  violationCount: true,
  openViolations: true,
  highSeverityCount: true,
  lastViolationAt: true,
  lastComputedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaEducatorRiskScoreRepository
  implements IEducatorRiskScoreRepository
{
  async upsert(data: UpsertRiskScoreData): Promise<EducatorRiskScoreRecord> {
    return prisma.educatorRiskScore.upsert({
      where: { userId: data.userId },
      create: {
        tenantId: data.tenantId,
        userId: data.userId,
        riskLevel: data.riskLevel,
        computedScore: data.computedScore,
        violationCount: data.violationCount,
        openViolations: data.openViolations,
        highSeverityCount: data.highSeverityCount,
        lastViolationAt: data.lastViolationAt ?? null,
        lastComputedAt: new Date(),
      },
      update: {
        riskLevel: data.riskLevel,
        computedScore: data.computedScore,
        violationCount: data.violationCount,
        openViolations: data.openViolations,
        highSeverityCount: data.highSeverityCount,
        lastViolationAt: data.lastViolationAt ?? null,
        lastComputedAt: new Date(),
      },
      select: RISK_SELECT,
    });
  }

  async findByUser(
    userId: string,
    tenantId: string,
  ): Promise<EducatorRiskScoreRecord | null> {
    return prisma.educatorRiskScore.findFirst({
      where: { userId, tenantId },
      select: RISK_SELECT,
    });
  }

  async listRisky(opts: {
    tenantId: string;
    riskLevels?: EducatorRiskLevel[];
    cursor?: { computedScore: number; userId: string };
    limit: number;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<EducatorRiskScoreRecord[]> {
    return prisma.educatorRiskScore.findMany({
      where: {
        tenantId: opts.tenantId,
        ...(opts.riskLevels?.length && { riskLevel: { in: opts.riskLevels } }),
        ...(opts.dateFrom && { lastViolationAt: { gte: opts.dateFrom } }),
        ...(opts.dateTo && { lastViolationAt: { lte: opts.dateTo } }),
        ...(opts.cursor && {
          OR: [
            { computedScore: { lt: opts.cursor.computedScore } },
            {
              computedScore: opts.cursor.computedScore,
              userId: { gt: opts.cursor.userId },
            },
          ],
        }),
      },
      select: RISK_SELECT,
      orderBy: [{ computedScore: 'desc' }, { userId: 'asc' }],
      take: opts.limit,
    });
  }

  async findRecentlyViolated(
    tenantId: string,
    since: Date,
  ): Promise<string[]> {
    const rows = await prisma.moderationViolation.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }
}
