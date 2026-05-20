import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { prisma } from '../../../infrastructure/database/prisma';
import { RecomputeEducatorRiskScoreUseCase } from '../../../application/use-cases/moderation/RecomputeEducatorRiskScoreUseCase';
import { PrismaModerationViolationRepository } from '../../../infrastructure/repositories/PrismaModerationViolationRepository';
import { PrismaEducatorRiskScoreRepository } from '../../../infrastructure/repositories/PrismaEducatorRiskScoreRepository';
import { PrismaModerationActionRepository } from '../../../infrastructure/repositories/PrismaModerationActionRepository';

const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'default';

@Injectable()
export class ModerationCronService {
  private readonly logger = new Logger(ModerationCronService.name);

  private readonly recompute: RecomputeEducatorRiskScoreUseCase;

  constructor(
    private readonly violationRepo: PrismaModerationViolationRepository,
    private readonly riskRepo: PrismaEducatorRiskScoreRepository,
    private readonly actionRepo: PrismaModerationActionRepository,
  ) {
    this.recompute = new RecomputeEducatorRiskScoreUseCase(
      riskRepo,
      violationRepo,
      actionRepo,
    );
  }

  /** Her saat: son 24 saatte ihlal alan eğiticilerin risk skorunu yeniden hesapla */
  @Cron('0 0 * * * *')
  async recomputeRecentlyViolated() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('[ModerationCron] Saatlik risk skoru yeniden hesaplama');

    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const userIds = await this.riskRepo.findRecentlyViolated(TENANT_ID, since24h);

      let updated = 0;
      for (const userId of userIds) {
        try {
          await this.recompute.execute({ userId, tenantId: TENANT_ID });
          updated++;
        } catch (err: any) {
          this.logger.warn(`[ModerationCron] Risk hesaplama başarısız: userId=${userId}`, err?.message);
        }
      }

      this.logger.log(`[ModerationCron] ${updated} eğitici güncellendi`);
    } catch (err: any) {
      this.logger.error('[ModerationCron] Saatlik cron hatası', err?.message);
    }
  }

  /** Her gün 03:00: süresi dolmuş askıya almaları temizle */
  @Cron('0 0 3 * * *')
  async clearExpiredSuspensions() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('[ModerationCron] Süresi dolmuş askıya almalar temizleniyor');

    try {
      const result = await prisma.user.updateMany({
        where: {
          suspendedUntil: { lt: new Date() },
          isBanned: false,
        },
        data: { suspendedUntil: null },
      });

      this.logger.log(`[ModerationCron] ${result.count} askıya alma kaldırıldı`);
    } catch (err: any) {
      this.logger.error('[ModerationCron] clearExpiredSuspensions hatası', err?.message);
    }
  }

  /** Her gün 04:00: 90 günden eski açık ihlalleri stale işaretle (resolvedAt set) */
  @Cron('0 0 4 * * *')
  async markStaleViolations() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('[ModerationCron] 90 gün stale ihlaller işaretleniyor');

    try {
      const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const result = await prisma.moderationViolation.updateMany({
        where: {
          createdAt: { lt: since90 },
          resolvedAt: null,
          status: 'OPEN',
        },
        data: { resolvedAt: new Date() },
      });

      this.logger.log(`[ModerationCron] ${result.count} stale ihlal işaretlendi`);
    } catch (err: any) {
      this.logger.error('[ModerationCron] markStaleViolations hatası', err?.message);
    }
  }
}
