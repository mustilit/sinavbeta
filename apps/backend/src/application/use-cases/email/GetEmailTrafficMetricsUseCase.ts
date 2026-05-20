import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Admin Dashboard KPI'ları — son 24s + 7g.
 */
export class GetEmailTrafficMetricsUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input: { tenantId: string }) {
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      counts24h,
      counts7d,
      providers,
      templatePerf,
      settings,
      queueDepth,
    ] = await Promise.all([
      this.statusCounts({ tenantId: input.tenantId, from: day }),
      this.statusCounts({ tenantId: input.tenantId, from: week }),
      this.db.emailProviderConfig.findMany({
        where: { tenantId: input.tenantId },
        orderBy: { priority: 'asc' },
        select: {
          id: true,
          name: true,
          kind: true,
          isActive: true,
          priority: true,
          dailyCap: true,
          dailySentCount: true,
          lastSuccessAt: true,
          lastFailureAt: true,
          lastFailureReason: true,
        },
      }),
      this.templatePerformance({ tenantId: input.tenantId, from: week }),
      this.db.adminSettings.findFirst({ where: { id: 1 } }),
      this.queueDepth(input.tenantId),
    ]);

    const bounceRate24h = this.rate(counts24h.bounced, counts24h.sent + counts24h.delivered);
    const alerted =
      bounceRate24h > (settings?.emailBounceRateAlertThreshold ?? 0.02) ||
      !!settings?.emailBulkAutoPausedAt;

    return {
      counts24h,
      counts7d,
      bounceRate24h,
      queueDepth,
      providers,
      templatePerformance: templatePerf,
      autoPaused: {
        active: !!settings?.emailBulkAutoPausedAt,
        at: settings?.emailBulkAutoPausedAt ?? null,
        reason: settings?.emailBulkAutoPausedReason ?? null,
      },
      alert: alerted,
    };
  }

  private async statusCounts(input: { tenantId: string; from: Date }) {
    const grouped = await this.db.emailLog.groupBy({
      by: ['status'],
      where: { tenantId: input.tenantId, queuedAt: { gte: input.from } },
      _count: { _all: true },
    });
    const out = {
      queued: 0,
      sending: 0,
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      failed: 0,
      blockedByAdmin: 0,
      blockedByPrefs: 0,
      suppressed: 0,
      deadLetter: 0,
    };
    for (const g of grouped) {
      switch (g.status) {
        case 'QUEUED':
          out.queued = g._count._all;
          break;
        case 'SENDING':
          out.sending = g._count._all;
          break;
        case 'SENT':
          out.sent = g._count._all;
          break;
        case 'DELIVERED':
          out.delivered = g._count._all;
          break;
        case 'BOUNCED':
          out.bounced = g._count._all;
          break;
        case 'COMPLAINED':
          out.complained = g._count._all;
          break;
        case 'FAILED':
          out.failed = g._count._all;
          break;
        case 'BLOCKED_BY_ADMIN':
          out.blockedByAdmin = g._count._all;
          break;
        case 'BLOCKED_BY_PREFS':
          out.blockedByPrefs = g._count._all;
          break;
        case 'SUPPRESSED':
          out.suppressed = g._count._all;
          break;
        case 'DEAD_LETTER':
          out.deadLetter = g._count._all;
          break;
      }
    }
    return out;
  }

  private async templatePerformance(input: { tenantId: string; from: Date }) {
    const grouped = await this.db.emailLog.groupBy({
      by: ['templateKey', 'status'],
      where: { tenantId: input.tenantId, queuedAt: { gte: input.from } },
      _count: { _all: true },
    });
    const map: Record<string, { sent: number; bounced: number; failed: number; total: number }> = {};
    for (const g of grouped) {
      const e = (map[g.templateKey] ??= { sent: 0, bounced: 0, failed: 0, total: 0 });
      e.total += g._count._all;
      if (g.status === 'SENT' || g.status === 'DELIVERED') e.sent += g._count._all;
      if (g.status === 'BOUNCED') e.bounced += g._count._all;
      if (g.status === 'FAILED' || g.status === 'DEAD_LETTER') e.failed += g._count._all;
    }
    return Object.entries(map).map(([templateKey, v]) => ({
      templateKey,
      ...v,
      successRate: this.rate(v.sent, v.total),
    }));
  }

  private async queueDepth(tenantId: string) {
    const grouped = await this.db.emailLog.groupBy({
      by: ['queue'],
      where: { tenantId, status: { in: ['QUEUED', 'SENDING'] } },
      _count: { _all: true },
    });
    const out: Record<'CRITICAL' | 'NOTIFY' | 'BULK', number> = {
      CRITICAL: 0,
      NOTIFY: 0,
      BULK: 0,
    };
    for (const g of grouped) out[g.queue] = g._count._all;
    return out;
  }

  private rate(num: number, denom: number): number {
    if (denom <= 0) return 0;
    return Math.round((num / denom) * 10_000) / 10_000;
  }
}
