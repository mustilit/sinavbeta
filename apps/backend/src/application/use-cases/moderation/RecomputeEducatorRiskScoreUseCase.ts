import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { EducatorRiskLevel, ModerationCategory } from '@prisma/client';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { logger } from '../../../infrastructure/logger/logger';

/** Kategori bazlı risk çarpanları */
const CATEGORY_MULTIPLIER: Record<ModerationCategory, number> = {
  SELF_HARM: 3.0,
  HATE_SPEECH: 3.0,
  SEXUAL_CONTENT: 2.0,
  VIOLENCE: 2.0,
  ILLEGAL: 2.0,
  HARASSMENT: 1.5,
  PROFANITY: 1.0,
  SPAM: 1.0,
  MISINFORMATION: 1.0,
  PERSONAL_DATA: 1.0,
  COPYRIGHT: 1.0,
  OTHER: 1.0,
};

function computeRecencyDecay(createdAt: Date): number {
  const days = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.1, 1 - days / 90);
}

function scoreToLevel(score: number, violationCount: number): EducatorRiskLevel {
  if (score >= 96) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 26) return 'MEDIUM';
  return 'LOW';
}

export interface RecomputeParams {
  userId: string;
  tenantId: string;
}

@Injectable()
export class RecomputeEducatorRiskScoreUseCase {
  constructor(
    private readonly riskRepo: IEducatorRiskScoreRepository,
    private readonly violationRepo: IModerationViolationRepository,
    private readonly actionRepo: IModerationActionRepository,
  ) {}

  async execute({ userId, tenantId }: RecomputeParams): Promise<void> {
    // Son 90 gün ihlaller
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const violations = await this.violationRepo.findOpenByUser(userId, tenantId, since90);

    const violationCount = violations.length;
    const openViolations = violations.filter((v) => v.status === 'OPEN').length;
    const highSeverityCount = violations.filter((v) => v.severity >= 4).length;
    const lastViolationAt =
      violations.length > 0
        ? violations.reduce((latest, v) =>
            v.createdAt > latest ? v.createdAt : latest,
            violations[0].createdAt,
          )
        : null;

    // Ağırlıklı skor hesapla
    let weightedSum = 0;
    for (const v of violations) {
      const multiplier = CATEGORY_MULTIPLIER[v.category] ?? 1.0;
      const decay = computeRecencyDecay(v.createdAt);
      weightedSum += v.severity * multiplier * decay;
    }

    const computedScore = Math.min(100, Math.round(weightedSum * 4));
    const riskLevel = scoreToLevel(computedScore, violationCount);

    await this.riskRepo.upsert({
      tenantId,
      userId,
      riskLevel,
      computedScore,
      violationCount,
      openViolations,
      highSeverityCount,
      lastViolationAt,
    });

    // AdminSettings'ten eşik değerlerini oku
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const suspendThreshold = settings?.moderationAutoSuspendThreshold ?? 80;
    const banThreshold = settings?.moderationAutoBanThreshold ?? 95;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, suspendedUntil: true },
    });

    if (!user) return;

    if (computedScore >= banThreshold && !user.isBanned) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { isBanned: true },
        });
        await tx.moderationAction.create({
          data: {
            tenantId,
            userId,
            actorId: null,
            actionType: 'ACCOUNT_BANNED',
            reason: `Otomatik ban: risk skoru ${computedScore} >= eşik ${banThreshold}`,
            metadata: { computedScore, riskLevel, auto: true },
          },
        });
      });
      logger.warn('[RecomputeRisk] Otomatik ban', { userId, computedScore });
    } else if (
      computedScore >= suspendThreshold &&
      computedScore < banThreshold &&
      !user.isBanned &&
      !user.suspendedUntil
    ) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 gün
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { suspendedUntil: expiresAt },
        });
        await tx.moderationAction.create({
          data: {
            tenantId,
            userId,
            actorId: null,
            actionType: 'ACCOUNT_SUSPENDED',
            reason: `Otomatik askıya alma: risk skoru ${computedScore} >= eşik ${suspendThreshold}`,
            metadata: { computedScore, riskLevel, auto: true },
            expiresAt,
          },
        });
      });
      logger.warn('[RecomputeRisk] Otomatik askıya alma', { userId, computedScore, expiresAt });
    }
  }
}
