// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prismaReplica } from '../database/prisma';

/**
 * Read-only reporting queries — read replica üzerinden çalışır.
 * Hiçbir write metodu YOK; bu sınıf write'lara izin vermez.
 */
@Injectable()
export class ReportingTestRepository {
  async topSellersByTenant(tenantId: string, days = 30, take = 20) {
    const since = new Date(Date.now() - days * 86400_000);
    return (prismaReplica as any).examTest.findMany({
      where: { tenantId, status: 'PUBLISHED', purchases: { some: { createdAt: { gte: since } } } },
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, priceCents: true, currency: true, educatorId: true },
    });
  }

  async recentPurchases(tenantId: string, take = 50) {
    return (prismaReplica as any).purchase.findMany({
      where: { tenantId },
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountCents: true, currency: true, amountUsdCents: true, createdAt: true, userId: true, testId: true },
    });
  }

  /**
   * Replication lag (saniye). Replica yoksa 0.
   */
  async replicationLagSeconds(): Promise<number> {
    if (!process.env.DATABASE_REPLICA_URL) return 0;
    try {
      const rows = await (prismaReplica as any).$queryRaw<{ lag: number | null }[]>`
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::float AS lag
      `;
      return rows?.[0]?.lag ?? 0;
    } catch {
      return -1;
    }
  }
}
