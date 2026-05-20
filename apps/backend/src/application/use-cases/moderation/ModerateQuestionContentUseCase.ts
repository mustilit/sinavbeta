import { Injectable } from '@nestjs/common';
import { ModerationCategory, ModerationProvider, ModerationStatus } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { ContentSafetyService } from '../../services/content-safety/ContentSafetyService';
import { IModerationResultRepository } from '../../../domain/interfaces/IModerationResultRepository';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { RecordModerationViolationUseCase } from './RecordModerationViolationUseCase';
import {
  enqueueModerationJob,
} from '../../services/content-safety/utils/moderationQueue';
import { logger } from '../../../infrastructure/logger/logger';

export interface ModerateQuestionParams {
  questionId: string;
  educatorId: string;
  tenantId: string;
  text: string;
  options?: Array<{ id: string; content: string }>;
  imageUrl?: string | null;
}

@Injectable()
export class ModerateQuestionContentUseCase {
  private readonly recordViolation: RecordModerationViolationUseCase;

  constructor(
    private readonly contentSafety: ContentSafetyService,
    private readonly moderationResultRepo: IModerationResultRepository,
    private readonly violationRepo: IModerationViolationRepository,
    private readonly riskRepo: IEducatorRiskScoreRepository,
    private readonly actionRepo: IModerationActionRepository,
  ) {
    this.recordViolation = new RecordModerationViolationUseCase(
      violationRepo,
      riskRepo,
      actionRepo,
    );
  }

  async execute(params: ModerateQuestionParams): Promise<void> {
    // AdminSettings
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const moderationSettings = {
      moderationEnabled: settings?.moderationEnabled ?? true,
      moderationClaudeEnabled: settings?.moderationClaudeEnabled ?? true,
      moderationModelText: settings?.moderationModelText ?? 'claude-haiku-4-5',
      moderationModelVision: settings?.moderationModelVision ?? 'claude-sonnet-4-6',
    };

    // Metin: soru içeriği + tüm seçenekleri birleştir
    const combinedText = [
      params.text,
      ...(params.options?.map((o) => o.content) ?? []),
    ].join('\n');

    const outcome = await this.contentSafety.moderate(
      {
        entityType: 'ExamQuestion',
        entityId: params.questionId,
        userId: params.educatorId,
        tenantId: params.tenantId,
        text: combinedText,
        imageUrl: params.imageUrl ?? undefined,
      },
      moderationSettings,
    );

    if (outcome.skipped) {
      // Moderasyon devre dışı → APPROVED yap
      await prisma.examQuestion.update({
        where: { id: params.questionId },
        data: {
          moderationStatus: 'APPROVED',
          moderatedAt: new Date(),
        },
      });
      return;
    }

    // Sonucu ve soru durumunu aynı transaction içinde kaydet
    await prisma.$transaction(async (tx) => {
      // ModerationResult kaydet
      const result = await tx.moderationResult.create({
        data: {
          tenantId: params.tenantId,
          userId: params.educatorId,
          entityType: 'ExamQuestion',
          entityId: params.questionId,
          provider: 'RULE_BASED' as ModerationProvider,
          status: outcome.status,
          score: outcome.layer1Result?.maxSeverity
            ? outcome.layer1Result.maxSeverity / 5
            : null,
          categories: outcome.layer1Result?.categories ?? [],
          matchedTerms: outcome.layer1Result?.matchedTerms ?? [],
          flaggedContent: combinedText.substring(0, 500),
        },
        select: { id: true },
      });

      // ExamQuestion durumunu güncelle
      let questionStatus: ModerationStatus = outcome.status;
      if (outcome.decision === 'MANUAL_REVIEW') {
        questionStatus = 'ESCALATED';
      }

      await tx.examQuestion.update({
        where: { id: params.questionId },
        data: {
          moderationStatus: questionStatus,
          moderatedAt: new Date(),
        },
      });

      // REJECTED: ihlal kaydı oluştur
      if (outcome.decision === 'REJECTED' && outcome.layer1Result) {
        const primaryCategory =
          outcome.layer1Result.categories[0] ?? ('OTHER' as ModerationCategory);
        await tx.moderationViolation.create({
          data: {
            tenantId: params.tenantId,
            userId: params.educatorId,
            moderationResultId: result.id,
            category: primaryCategory,
            severity: outcome.layer1Result.maxSeverity ?? 3,
            entityType: 'ExamQuestion',
            entityId: params.questionId,
            status: 'OPEN',
          },
        });
      }

      // PENDING_REVIEW: Layer2 kuyruğuna ekle
      if (outcome.enqueuedForLayer2) {
        await enqueueModerationJob({
          type: 'text-moderation',
          resultId: result.id,
          entityType: 'ExamQuestion',
          entityId: params.questionId,
          userId: params.educatorId,
          tenantId: params.tenantId,
          content: combinedText,
          modelName: moderationSettings.moderationModelText,
          l1Result: outcome.layer1Result!,
        });
      }
    });

    // REJECTED ise risk skoru yeniden hesapla (transaction dışında, best-effort)
    if (outcome.decision === 'REJECTED' && outcome.layer1Result) {
      try {
        await this.recordViolation.execute({
          tenantId: params.tenantId,
          userId: params.educatorId,
          category:
            outcome.layer1Result.categories[0] ?? ('OTHER' as ModerationCategory),
          severity: outcome.layer1Result.maxSeverity ?? 3,
          entityType: 'ExamQuestion',
          entityId: params.questionId,
        });
      } catch (err: any) {
        logger.warn('[ModerateQuestion] Risk skoru yeniden hesaplama başarısız', {
          error: err?.message,
          userId: params.educatorId,
        });
      }
    }
  }
}
