import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Cron: son 1 saat içindeki bounce/sent oranı eşik üstündeyse BULK kuyruğunu otomatik durdurur.
 * Admin manuel açana kadar kapalı kalır.
 */
export class CheckBounceRateAlertUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input?: { now?: Date }) {
    const now = input?.now ?? new Date();
    const since = new Date(now.getTime() - 60 * 60 * 1000);

    const settings = await this.db.adminSettings.findFirst({ where: { id: 1 } });
    const threshold = settings?.emailBounceRateAlertThreshold ?? 0.02;

    const counts = await this.db.emailLog.groupBy({
      by: ['status'],
      where: { queuedAt: { gte: since } },
      _count: { _all: true },
    });
    let bounced = 0;
    let total = 0;
    for (const c of counts) {
      total += c._count._all;
      if (c.status === 'BOUNCED' || c.status === 'COMPLAINED') bounced += c._count._all;
    }
    const rate = total > 0 ? bounced / total : 0;
    if (rate < threshold) {
      return { ok: true, rate, threshold, action: 'no_action' };
    }
    // Otomatik durdur (zaten kapalıysa noop)
    if (settings && (settings.emailEducatorBulkEnabled || settings.emailCandidateBulkEnabled)) {
      await this.db.adminSettings.update({
        where: { id: 1 },
        data: {
          emailEducatorBulkEnabled: false,
          emailCandidateBulkEnabled: false,
          emailBulkAutoPausedAt: now,
          emailBulkAutoPausedReason: `Bounce rate ${(rate * 100).toFixed(2)}% > eşik ${(threshold * 100).toFixed(2)}%`,
        },
      });
      await this.db.auditLog.create({
        data: {
          action: 'EMAIL_KILL_SWITCH_CHANGED',
          entityType: 'AdminSettings',
          entityId: '1',
          actorId: null,
          metadata: { reason: 'auto_pause_high_bounce', rate, threshold } as any,
        },
      });
      return { ok: true, rate, threshold, action: 'bulk_auto_paused' };
    }
    return { ok: true, rate, threshold, action: 'already_paused' };
  }
}
