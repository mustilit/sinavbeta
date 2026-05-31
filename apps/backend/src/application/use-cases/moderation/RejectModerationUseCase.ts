import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { RecomputeEducatorRiskScoreUseCase } from './RecomputeEducatorRiskScoreUseCase';

export interface RejectModerationParams {
  resultId: string;
  reviewerId: string;
  reviewerNote?: string | null;
}

@Injectable()
export class RejectModerationUseCase {
  private readonly recompute: RecomputeEducatorRiskScoreUseCase;

  constructor(
    private readonly violationRepo: IModerationViolationRepository,
    private readonly riskRepo: IEducatorRiskScoreRepository,
    private readonly actionRepo: IModerationActionRepository,
  ) {
    this.recompute = new RecomputeEducatorRiskScoreUseCase(
      riskRepo,
      violationRepo,
      actionRepo,
    );
  }

  async execute(params: RejectModerationParams): Promise<void> {
    const result = await prisma.moderationResult.findUnique({
      where: { id: params.resultId },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        status: true,
        categories: true,
        score: true,
      },
    });

    if (!result) {
      throw new AppError('MODERATION_RESULT_NOT_FOUND', 'Moderasyon sonucu bulunamadı', 404);
    }

    if (result.status === 'REJECTED') {
      return; // Zaten reddedilmiş
    }

    await prisma.$transaction(async (tx) => {
      // ModerationResult güncelle
      await tx.moderationResult.update({
        where: { id: params.resultId },
        data: {
          status: 'REJECTED',
          reviewerNote: params.reviewerNote ?? undefined,
          reviewedAt: new Date(),
        },
      });

      // Violation varsa CONFIRMED yap, yoksa oluştur
      const existing = await tx.moderationViolation.findFirst({
        where: { moderationResultId: params.resultId },
        select: { id: true },
      });

      if (existing) {
        await tx.moderationViolation.update({
          where: { id: existing.id },
          data: {
            status: 'CONFIRMED',
            reviewedBy: params.reviewerId,
            reviewedAt: new Date(),
          },
        });
      } else {
        const primaryCategory =
          (result.categories as ModerationCategory[])[0] ??
          ('OTHER' as ModerationCategory);
        await tx.moderationViolation.create({
          data: {
            tenantId: result.tenantId,
            userId: result.userId,
            moderationResultId: params.resultId,
            category: primaryCategory,
            severity: Math.round((result.score ?? 0.5) * 5),
            entityType: result.entityType,
            entityId: result.entityId,
            status: 'CONFIRMED',
            reviewedBy: params.reviewerId,
            reviewedAt: new Date(),
          },
        });
      }

      // ExamQuestion güncelle
      if (result.entityType === 'ExamQuestion') {
        await tx.examQuestion.update({
          where: { id: result.entityId },
          data: {
            moderationStatus: 'REJECTED',
            moderatedAt: new Date(),
          },
        });
      }

      // EducatorProfile: İhlal onaylanınca tanıtım metnini (bio) KALDIR. entityId =
      // educator userId. metadata.bio raw SQL ile temizlenir — suspended/rejected
      // eğiticilerde Prisma enum hydration sorununu önlemek için (updateEducatorProfile
      // ile aynı pattern). Eğitici sonradan temiz bir metin girebilir (yeniden moderasyon).
      if (result.entityType === 'EducatorProfile') {
        const urows = await tx.$queryRaw<Array<{ metadata: any }>>`
          SELECT metadata FROM users WHERE id = ${result.entityId} LIMIT 1
        `;
        if (urows[0]) {
          const meta = (urows[0].metadata as Record<string, unknown>) ?? {};
          meta.bio = '';
          await tx.$executeRaw`
            UPDATE users SET metadata = ${JSON.stringify(meta)}::jsonb, "updatedAt" = NOW()
            WHERE id = ${result.entityId}
          `;
        }
      }
    });

    // Risk skoru yeniden hesapla
    await this.recompute.execute({
      userId: result.userId,
      tenantId: result.tenantId,
    });
  }
}
