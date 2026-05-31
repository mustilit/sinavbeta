import { Injectable } from '@nestjs/common';
import { ModerationCategory, ModerationStatus } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Durum filtresi → ModerationStatus eşlemesi.
 *  - pending: henüz incelenmemiş (kuyrukta bekleyen)
 *  - reviewed: incelenmiş (geçmiş) — APPROVED (Uygun) / REJECTED (İhlal)
 *  - all: tümü
 */
const STATUS_BY_FILTER: Record<string, ModerationStatus[]> = {
  pending: ['PENDING_REVIEW', 'ESCALATED'],
  reviewed: ['APPROVED', 'REJECTED'],
  all: ['PENDING_REVIEW', 'ESCALATED', 'APPROVED', 'REJECTED'],
};

export interface ListPendingModerationsParams {
  tenantId: string;
  cursor?: { id: string };
  limit?: number;
  category?: ModerationCategory;
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  /** 'pending' (varsayılan) | 'reviewed' | 'all' */
  statusFilter?: string;
}

@Injectable()
export class ListPendingModerationsUseCase {
  async execute(params: ListPendingModerationsParams) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1;

    const rows = await prisma.moderationResult.findMany({
      where: {
        tenantId: params.tenantId,
        status: { in: STATUS_BY_FILTER[params.statusFilter ?? 'pending'] ?? STATUS_BY_FILTER.pending },
        ...(params.category && { categories: { has: params.category } }),
        ...(params.userId && { userId: params.userId }),
        ...(params.dateFrom || params.dateTo
          ? {
              createdAt: {
                ...(params.dateFrom && { gte: params.dateFrom }),
                ...(params.dateTo && { lte: params.dateTo }),
              },
            }
          : {}),
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        userId: true,
        provider: true,
        status: true,
        score: true,
        categories: true,
        matchedTerms: true,
        flaggedContent: true,
        reasonText: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor && {
        cursor: { id: params.cursor.id },
        skip: 1,
      }),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;

    return {
      items,
      nextCursor: hasMore ? { id: items[items.length - 1].id } : null,
    };
  }
}
