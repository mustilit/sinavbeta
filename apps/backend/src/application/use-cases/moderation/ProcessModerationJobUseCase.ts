import { Injectable } from '@nestjs/common';
import { ModerationCategory, ModerationStatus } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { ClaudeTextProvider } from '../../services/content-safety/providers/ClaudeTextProvider';
import { ClaudeVisionProvider } from '../../services/content-safety/providers/ClaudeVisionProvider';
import { ModerationJobPayload } from '../../services/content-safety/utils/moderationQueue';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { RecordModerationViolationUseCase } from './RecordModerationViolationUseCase';
import { logger } from '../../../infrastructure/logger/logger';

/** AdminSettings'ten okunan threshold yapısı */
interface ModerationThresholds {
  hate?: number;
  sexual?: number;
  violence?: number;
  selfHarm?: number;
  harassment?: number;
  illegal?: number;
  profanity?: number;
}

function exceedsThreshold(
  scores: Record<string, number>,
  thresholds: ModerationThresholds,
): boolean {
  if (scores.hate != null && scores.hate >= (thresholds.hate ?? 0.7)) return true;
  if (scores.sexual != null && scores.sexual >= (thresholds.sexual ?? 0.6)) return true;
  if (scores.violence != null && scores.violence >= (thresholds.violence ?? 0.7)) return true;
  if (scores.personalData != null && scores.personalData >= 0.7) return true;
  if (scores.spam != null && scores.spam >= 0.7) return true;
  if (scores.overall != null && scores.overall >= 0.8) return true;
  return false;
}

@Injectable()
export class ProcessModerationJobUseCase {
  private readonly recordViolation: RecordModerationViolationUseCase;

  constructor(
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

  async execute(payload: ModerationJobPayload): Promise<void> {
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const thresholds: ModerationThresholds =
      (settings?.moderationThresholds as ModerationThresholds) ?? {};

    let layer2Result: any;
    let newStatus: ModerationStatus;
    let categories: ModerationCategory[] = [];
    let cost: number | null = null;
    let latencyMs = 0;

    try {
      if (payload.type === 'text-moderation') {
        const provider = new ClaudeTextProvider(payload.modelName);
        layer2Result = await provider.analyze(payload.content, payload.tenantId);
      } else {
        // Görsel URL'den buffer indir
        const https = await import('https');
        const imageBuffer: Buffer = await new Promise((resolve, reject) => {
          https.get(payload.imageUrl, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          });
        });
        const provider = new ClaudeVisionProvider(payload.modelName);
        layer2Result = await provider.analyze(imageBuffer, 'image/jpeg', payload.tenantId);
      }

      cost = layer2Result.costUsd ?? null;
      latencyMs = layer2Result.latencyMs ?? 0;
      categories = layer2Result.categories ?? [];

      const rejected =
        layer2Result.verdict === 'REJECTED' ||
        exceedsThreshold(layer2Result.scores ?? {}, thresholds);

      newStatus = rejected ? 'REJECTED' : 'APPROVED';
    } catch (err: any) {
      logger.error('[ProcessModerationJob] Layer2 hatası', {
        error: err?.message,
        resultId: payload.resultId,
      });
      // Hata → ESCALATED + rawResponse'a hata kaydı
      await prisma.moderationResult.update({
        where: { id: payload.resultId },
        data: {
          status: 'ESCALATED',
          rawResponse: { error: err?.message },
        },
      });
      await prisma.examQuestion.updateMany({
        where: { id: payload.entityId },
        data: { moderationStatus: 'ESCALATED' },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.moderationResult.update({
        where: { id: payload.resultId },
        data: {
          status: newStatus,
          provider: 'CLAUDE',
          categories,
          score: layer2Result.scores?.overall ?? null,
          scores: layer2Result.scores,
          reasonText: layer2Result.reasoning ?? null,
          rawResponse: layer2Result.raw,
          cost: cost != null ? String(cost) : null,
          latencyMs,
          reviewedAt: new Date(),
        },
      });

      await tx.examQuestion.updateMany({
        where: { id: payload.entityId },
        data: {
          moderationStatus: newStatus,
          moderatedAt: new Date(),
        },
      });

      if (newStatus === 'REJECTED') {
        const primaryCategory = categories[0] ?? ('OTHER' as ModerationCategory);
        await tx.moderationViolation.create({
          data: {
            tenantId: payload.tenantId,
            userId: payload.userId,
            moderationResultId: payload.resultId,
            category: primaryCategory,
            severity: Math.round((layer2Result.scores?.overall ?? 0.5) * 5),
            entityType: payload.entityType,
            entityId: payload.entityId,
            status: 'OPEN',
          },
        });
      }
    });

    if (newStatus === 'REJECTED') {
      try {
        await this.recordViolation.execute({
          tenantId: payload.tenantId,
          userId: payload.userId,
          category: categories[0] ?? ('OTHER' as ModerationCategory),
          severity: Math.round((layer2Result.scores?.overall ?? 0.5) * 5),
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
      } catch (err: any) {
        logger.warn('[ProcessModerationJob] Risk skoru güncelleme başarısız', {
          error: err?.message,
        });
      }
    }
  }
}
