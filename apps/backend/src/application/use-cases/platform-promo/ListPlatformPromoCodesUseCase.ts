import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Sprint 15 #3 — Admin paneli için tüm platform promo kodlarını listele.
 *
 * Cursor pagination + opsiyonel scope filtresi. usedCount görünür → admin
 * "tükenmiş mi" bakar. Kullanım detayı için ayrı endpoint (Usage listesi).
 */
export class ListPlatformPromoCodesUseCase {
  async execute(params: {
    cursor?: string;
    limit?: number;
    scope?: 'LIVE_SESSION' | 'AD_PACKAGE';
    onlyActive?: boolean;
  } = {}) {
    const take = Math.min(Math.max(params.limit ?? 50, 1), 100) + 1;

    const where: any = {};
    if (params.scope) {
      where.scopes = { has: params.scope };
    }
    if (params.onlyActive) {
      where.isActive = true;
    }

    const rows = await prisma.platformPromoCode.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > (params.limit ?? 50);
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? last.id : null,
    };
  }
}
