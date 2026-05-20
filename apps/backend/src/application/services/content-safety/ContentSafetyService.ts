import { Injectable } from '@nestjs/common';
import { ModerationStatus } from '@prisma/client';
import { logger } from '../../../infrastructure/logger/logger';
import { AppError } from '../../errors/AppError';
import {
  Layer1Result,
  Layer2Result,
  ModerationDecision,
  ModerationInput,
  ModerationOutcome,
} from './types';
import { BlocklistTextProvider } from './providers/BlocklistTextProvider';
import { NsfwjsImageProvider } from './providers/NsfwjsImageProvider';

/**
 * AdminSettings'ten okunan moderasyon yapılandırması.
 * UseCase katmanı bu nesneyi servis çağrısından önce doldurur.
 */
export interface ModerationSettings {
  moderationEnabled: boolean;
  moderationClaudeEnabled: boolean;
  /** Layer2 metin modeli adı */
  moderationModelText: string;
  /** Layer2 görsel modeli adı */
  moderationModelVision: string;
}

/**
 * ContentSafetyService — moderasyon orkestratörü.
 *
 * Persist sorumluluğu burada değil; Use Case katmanı transaction içinde
 * bu servisin döndürdüğü outcome'u kaydeder.
 *
 * Orchestration mantığı:
 *   moderationEnabled=false → SKIPPED
 *   Layer1 = REJECTED       → Layer1 sonucu döndür (REJECTED)
 *   Layer1 = APPROVED       → APPROVED döndür
 *   Layer1 = SUSPECT:
 *     claudeEnabled=true    → kuyruğa ekle, PENDING_REVIEW döndür
 *     claudeEnabled=false   → MANUAL_REVIEW döndür
 */
@Injectable()
export class ContentSafetyService {
  constructor(
    private readonly blocklistProvider: BlocklistTextProvider,
    private readonly nsfwjsProvider: NsfwjsImageProvider,
  ) {}

  async moderate(
    input: ModerationInput,
    settings: ModerationSettings,
  ): Promise<ModerationOutcome> {
    if (!settings.moderationEnabled) {
      return {
        decision: 'SKIPPED',
        status: 'APPROVED' as ModerationStatus,
        enqueuedForLayer2: false,
        skipped: true,
      };
    }

    // ── Katman 1: kural tabanlı ────────────────────────────────────────────────
    let layer1Result: Layer1Result | undefined;

    if (input.text) {
      try {
        const result = await this.blocklistProvider.analyze(
          input.text,
          input.tenantId,
        );
        layer1Result = result as Layer1Result;
      } catch (err: any) {
        // Blocklist hatası → güvenli tarafta kal
        logger.warn('[ContentSafetyService] Blocklist hatası, MANUAL_REVIEW döndürülüyor', {
          error: err?.message,
          entityId: input.entityId,
        });
        return this.buildOutcome('MANUAL_REVIEW', undefined, false, false);
      }
    }

    if (input.imageBuffer && !layer1Result) {
      try {
        const result = await this.nsfwjsProvider.analyze(
          input.imageBuffer,
          input.imageMediaType ?? 'image/jpeg',
          input.tenantId,
        );
        layer1Result = result as Layer1Result;
      } catch (err: any) {
        // NSFWjs hatası — paketi yüklü değilse graceful degrade
        logger.warn('[ContentSafetyService] NSFWjs hatası, MANUAL_REVIEW döndürülüyor', {
          error: err?.message,
          entityId: input.entityId,
        });
        return this.buildOutcome('MANUAL_REVIEW', undefined, false, false);
      }
    }

    if (!layer1Result) {
      // Ne metin ne görsel → içerik yok, APPROVED
      return this.buildOutcome('APPROVED', undefined, false, false);
    }

    // ── Layer1 sonucuna göre karar ────────────────────────────────────────────
    if (layer1Result.status === 'REJECTED') {
      return this.buildOutcome('REJECTED', layer1Result, false, false);
    }

    if (layer1Result.status === 'APPROVED') {
      return this.buildOutcome('APPROVED', layer1Result, false, false);
    }

    // SUSPECT: Layer2 gerekiyor mu?
    if (!settings.moderationClaudeEnabled) {
      return this.buildOutcome('MANUAL_REVIEW', layer1Result, false, false);
    }

    // claudeEnabled=true → kuyruğa ekle
    return this.buildOutcome('PENDING_REVIEW', layer1Result, true, false);
  }

  // ── Yardımcı metodlar ────────────────────────────────────────────────────────

  private buildOutcome(
    decision: ModerationDecision,
    layer1Result: Layer1Result | undefined,
    enqueuedForLayer2: boolean,
    skipped: boolean,
  ): ModerationOutcome {
    const status = this.decisionToStatus(decision);
    return {
      decision,
      status,
      layer1Result,
      enqueuedForLayer2,
      skipped,
    };
  }

  /**
   * ModerationDecision → Prisma ModerationStatus eşlemesi.
   * MANUAL_REVIEW mevcut şemada yoktur; PENDING_REVIEW olarak persist edilir.
   */
  private decisionToStatus(decision: ModerationDecision): ModerationStatus {
    switch (decision) {
      case 'APPROVED':
        return 'APPROVED';
      case 'REJECTED':
        return 'REJECTED';
      case 'PENDING_REVIEW':
        return 'PENDING_REVIEW';
      case 'MANUAL_REVIEW':
        return 'PENDING_REVIEW'; // şema eşlemesi
      case 'SKIPPED':
        return 'APPROVED';
    }
  }
}
