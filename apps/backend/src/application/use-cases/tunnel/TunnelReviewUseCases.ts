import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

async function requireActivePurchase(candidateId: string, tunnelId: string) {
  const p = await prisma.tunnelPurchase.findUnique({
    where: { candidateId_tunnelId: { candidateId, tunnelId } },
    select: { status: true, tenantId: true },
  });
  if (!p || p.status !== 'ACTIVE') throw new AppError('TUNNEL_NOT_PURCHASED', 'Bu tüneli satın almadınız', 403);
  return p;
}

/** Aday tünel değerlendirmesi oluşturur/günceller (yalnız satın alan). */
export class UpsertTunnelReviewUseCase {
  async execute(tunnelId: string, actorId: string | null | undefined, input: { rating: number; comment?: string | null }) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const rating = Math.round(Number(input.rating));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError('INVALID_RATING', 'Puan 1-5 arası olmalı', 400);
    const purchase = await requireActivePurchase(actorId, tunnelId);
    const comment = (input.comment ?? '').trim().slice(0, 2000) || null;

    const existing = await prisma.tunnelReview.findUnique({
      where: { tunnelId_candidateId: { tunnelId, candidateId: actorId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.tunnelReview.update({ where: { id: existing.id }, data: { rating, comment } });
    } else {
      await prisma.tunnelReview.create({
        data: { tenantId: purchase.tenantId, tunnelId, candidateId: actorId, rating, comment },
      });
    }
    return { ok: true };
  }
}

/** Tünel değerlendirmeleri: ortalama + sayı + sayfalı liste (gizlilik: yalnız ad). */
export class ListTunnelReviewsUseCase {
  async execute(tunnelId: string, opts?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 50);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const [agg, rows] = await Promise.all([
      prisma.tunnelReview.aggregate({ where: { tunnelId }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.tunnelReview.findMany({
        where: { tunnelId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: { id: true, rating: true, comment: true, createdAt: true, candidateId: true },
      }),
    ]);

    // Ad çözümleme (gizlilik: id değil, kullanıcı adı)
    const ids = [...new Set(rows.map((r) => r.candidateId))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.username]));

    return {
      avg: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count._all,
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        candidateName: nameById.get(r.candidateId) ?? 'Aday',
      })),
    };
  }
}

/** Adayın kendi değerlendirmesi (varsa). */
export class GetMyTunnelReviewUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    if (!actorId) return null;
    const r = await prisma.tunnelReview.findUnique({
      where: { tunnelId_candidateId: { tunnelId, candidateId: actorId } },
      select: { rating: true, comment: true, createdAt: true, updatedAt: true },
    });
    return r ?? null;
  }
}
