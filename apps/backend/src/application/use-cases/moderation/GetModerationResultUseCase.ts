import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

@Injectable()
export class GetModerationResultUseCase {
  async execute(id: string) {
    const result = await prisma.moderationResult.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        provider: true,
        status: true,
        score: true,
        scores: true,
        categories: true,
        matchedTerms: true,
        flaggedContent: true,
        reasonText: true,
        reviewerNote: true,
        rawResponse: true,
        cost: true,
        latencyMs: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    if (!result) {
      throw new AppError('MODERATION_RESULT_NOT_FOUND', 'Moderasyon sonucu bulunamadı', 404);
    }

    // İlgili violation
    const violation = await prisma.moderationViolation.findFirst({
      where: { moderationResultId: id },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        adminNote: true,
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    // Entity snippet — sadece ExamQuestion için
    let entitySnippet: string | null = null;
    if (result.entityType === 'ExamQuestion') {
      const q = await prisma.examQuestion.findUnique({
        where: { id: result.entityId },
        select: { content: true },
      });
      entitySnippet = q?.content?.substring(0, 200) ?? null;
    }

    return { result, violation, entitySnippet };
  }
}
