import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export interface ApproveModerationParams {
  resultId: string;
  reviewerId: string;
  reviewerNote?: string | null;
}

@Injectable()
export class ApproveModerationUseCase {
  async execute(params: ApproveModerationParams): Promise<void> {
    const result = await prisma.moderationResult.findUnique({
      where: { id: params.resultId },
      select: { id: true, entityType: true, entityId: true, status: true },
    });

    if (!result) {
      throw new AppError('MODERATION_RESULT_NOT_FOUND', 'Moderasyon sonucu bulunamadı', 404);
    }

    if (result.status === 'APPROVED') {
      return; // Zaten onaylı — idempotent
    }

    await prisma.$transaction(async (tx) => {
      // ModerationResult güncelle
      await tx.moderationResult.update({
        where: { id: params.resultId },
        data: {
          status: 'APPROVED',
          reviewerNote: params.reviewerNote ?? undefined,
          reviewedAt: new Date(),
        },
      });

      // İlgili violation varsa DISMISSED yap
      await tx.moderationViolation.updateMany({
        where: { moderationResultId: params.resultId },
        data: {
          status: 'DISMISSED',
          reviewedBy: params.reviewerId,
          reviewedAt: new Date(),
        },
      });

      // ExamQuestion güncelle
      if (result.entityType === 'ExamQuestion') {
        await tx.examQuestion.update({
          where: { id: result.entityId },
          data: {
            moderationStatus: 'APPROVED',
            moderatedAt: new Date(),
          },
        });
      }
    });
  }
}
