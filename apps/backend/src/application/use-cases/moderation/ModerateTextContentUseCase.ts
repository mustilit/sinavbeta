import { Injectable } from '@nestjs/common';
import { ModerationCategory, ModerationProvider } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { ContentSafetyService } from '../../services/content-safety/ContentSafetyService';
import { IModerationResultRepository } from '../../../domain/interfaces/IModerationResultRepository';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { RecordModerationViolationUseCase } from './RecordModerationViolationUseCase';
import { enqueueModerationJob } from '../../services/content-safety/utils/moderationQueue';
import { EntityType } from '../../services/content-safety/types';
import { ModerationDecision } from '../../services/content-safety/types';
import { logger } from '../../../infrastructure/logger/logger';

export interface ModerateTextParams {
  /** 'Review' | 'EducatorProfile' | 'LiveQuestion' vb. — audit + admin kuyruğu için. */
  entityType: EntityType;
  /** Kayıt id'si (henüz yazılmamışsa pending placeholder geçilebilir). */
  entityId: string;
  /** İçeriği yazan kullanıcı (aday veya eğitici). */
  userId: string;
  tenantId: string;
  /** Moderasyona girecek metin (soru/yorum/bio). */
  text: string;
  /**
   * Eğitici-yazımı içerik mi? true → REJECTED olunca eğitici risk skoru yeniden
   * hesaplanır. Aday yorumları için false (risk skoru eğitici odaklı).
   */
  isEducatorContent?: boolean;
}

export interface ModerateTextResult {
  /** false → çağıran yazma işlemini ENGELLEMELİDİR (sert blok). */
  allowed: boolean;
  decision: ModerationDecision;
  categories: ModerationCategory[];
  matchedTerms: string[];
  /** REJECTED için kullanıcıya gösterilecek gerekçe. */
  message?: string;
}

/**
 * Generic metin moderasyonu — `ModerateQuestionContentUseCase`'in entity-agnostik
 * kardeşi. Soru moderasyonu post-write (async flag) iken bu use case SENKRON çalışır
 * ve karar döner: çağıran REJECTED'da yazmayı engeller ("sert blok"), SUSPECT'te
 * yayına izin verir ama admin moderasyon kuyruğuna düşürür (Layer2/Claude).
 *
 * Şema değişikliği gerektirmez — sonuç jenerik `ModerationResult`/`ModerationViolation`
 * tablolarına yazılır (entityType serbest string). Aday yorumu, eğitici tanıtım metni
 * ve canlı test soruları bu kapıdan geçer.
 */
@Injectable()
export class ModerateTextContentUseCase {
  private readonly recordViolation: RecordModerationViolationUseCase;

  constructor(
    private readonly contentSafety: ContentSafetyService,
    // Simetri için tutuluyor; persist doğrudan prisma ile (ModerateQuestionContentUseCase ile aynı).
    private readonly _moderationResultRepo: IModerationResultRepository,
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

  async execute(params: ModerateTextParams): Promise<ModerateTextResult> {
    const text = (params.text ?? '').trim();
    // İçerik yoksa moderasyona gerek yok — izin ver.
    if (!text) {
      return { allowed: true, decision: 'SKIPPED', categories: [], matchedTerms: [] };
    }

    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const moderationSettings = {
      moderationEnabled: settings?.moderationEnabled ?? true,
      moderationClaudeEnabled: settings?.moderationClaudeEnabled ?? true,
      moderationModelText: settings?.moderationModelText ?? 'claude-haiku-4-5',
      moderationModelVision: settings?.moderationModelVision ?? 'claude-sonnet-4-6',
    };

    const outcome = await this.contentSafety.moderate(
      {
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        tenantId: params.tenantId,
        text,
      },
      moderationSettings,
    );

    // Moderasyon kapalı → izin ver.
    if (outcome.skipped) {
      return { allowed: true, decision: 'SKIPPED', categories: [], matchedTerms: [] };
    }

    const categories = outcome.layer1Result?.categories ?? [];
    const matchedTerms = outcome.layer1Result?.matchedTerms ?? [];

    // Sonuç + (REJECTED ise) ihlal kaydı — best-effort; persist hatası kararı değiştirmez.
    try {
      await prisma.$transaction(async (tx) => {
        const result = await tx.moderationResult.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            entityType: params.entityType,
            entityId: params.entityId,
            provider: 'RULE_BASED' as ModerationProvider,
            status: outcome.status,
            score: outcome.layer1Result?.maxSeverity
              ? outcome.layer1Result.maxSeverity / 5
              : null,
            categories,
            matchedTerms,
            flaggedContent: text.substring(0, 500),
          },
          select: { id: true },
        });

        if (outcome.decision === 'REJECTED' && outcome.layer1Result) {
          await tx.moderationViolation.create({
            data: {
              tenantId: params.tenantId,
              userId: params.userId,
              moderationResultId: result.id,
              category: categories[0] ?? ('OTHER' as ModerationCategory),
              severity: outcome.layer1Result.maxSeverity ?? 3,
              entityType: params.entityType,
              entityId: params.entityId,
              status: 'OPEN',
            },
          });
        }

        // SUSPECT + Claude açık → Layer2 kuyruğuna ekle (admin kuyruğunda görünür).
        if (outcome.enqueuedForLayer2) {
          await enqueueModerationJob({
            type: 'text-moderation',
            resultId: result.id,
            entityType: params.entityType,
            entityId: params.entityId,
            userId: params.userId,
            tenantId: params.tenantId,
            content: text,
            modelName: moderationSettings.moderationModelText,
            l1Result: outcome.layer1Result!,
          });
        }
      });
    } catch (err: any) {
      logger.warn('[ModerateText] Sonuç kaydı başarısız (best-effort)', {
        error: err?.message,
        entityType: params.entityType,
        entityId: params.entityId,
      });
    }

    // Eğitici içeriği REJECTED → risk skorunu yeniden hesapla (best-effort).
    if (
      outcome.decision === 'REJECTED' &&
      params.isEducatorContent &&
      outcome.layer1Result
    ) {
      try {
        await this.recordViolation.execute({
          tenantId: params.tenantId,
          userId: params.userId,
          category: categories[0] ?? ('OTHER' as ModerationCategory),
          severity: outcome.layer1Result.maxSeverity ?? 3,
          entityType: params.entityType,
          entityId: params.entityId,
        });
      } catch (err: any) {
        logger.warn('[ModerateText] Risk skoru hesaplama başarısız', {
          error: err?.message,
          userId: params.userId,
        });
      }
    }

    const allowed = outcome.decision !== 'REJECTED';
    return {
      allowed,
      decision: outcome.decision,
      categories,
      matchedTerms,
      message: allowed
        ? undefined
        : 'İçerik topluluk kurallarına aykırı ifadeler içerdiği için reddedildi. Lütfen düzenleyip tekrar deneyin.',
    };
  }
}
